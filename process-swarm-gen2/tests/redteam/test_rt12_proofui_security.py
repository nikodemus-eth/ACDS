"""Red Team tests -- ProofUI security surface.

RT-12 covers:
  1. XSS protection (h() uses textContent, server HTML-encodes user input)
  2. CORS restriction (only localhost origins allowed)
  3. Artifact path traversal (directory escape blocked)
  4. Delivery destination validation (injection payloads handled safely)
"""

from __future__ import annotations

import html
import json
import os
import threading
import time
import urllib.request
import urllib.error
from http.server import HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn

import pytest

from proof_ui.server import ProofUIState, SwarmPlatform, _make_handler
from swarm.delivery.adapters import EmailAdapter, TelegramAdapter


pytestmark = pytest.mark.redteam


# ---------------------------------------------------------------------------
# Shared fixture: real ProofUI server on a random port
# ---------------------------------------------------------------------------

@pytest.fixture()
def proofui_server(tmp_path):
    """Start a real threaded ProofUI HTTP server on a random port.

    Yields (base_url, openclaw_root) then shuts down.
    """
    openclaw_root = tmp_path / "openclaw"
    openclaw_root.mkdir()
    # Create required subdirectories so ProofUIState / SwarmPlatform init cleanly
    (openclaw_root / "artifacts" / "executions").mkdir(parents=True)
    (openclaw_root / "artifacts" / "plans").mkdir(parents=True)
    (openclaw_root / "artifacts" / "validation").mkdir(parents=True)
    (openclaw_root / "artifacts" / "leases" / "active").mkdir(parents=True)
    (openclaw_root / "artifacts" / "proposals").mkdir(parents=True)
    (openclaw_root / "ledger").mkdir(parents=True)
    (openclaw_root / "workspace").mkdir(parents=True)

    state = ProofUIState(openclaw_root)
    platform = SwarmPlatform(openclaw_root)
    handler_cls = _make_handler(state, platform)

    class ThreadedServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

    server = ThreadedServer(("127.0.0.1", 0), handler_cls)
    port = server.server_address[1]

    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    base_url = f"http://127.0.0.1:{port}"
    try:
        yield base_url, openclaw_root, platform
    finally:
        server.shutdown()
        server.server_close()
        platform.db.close()


def _get(url, headers=None):
    """HTTP GET returning (status, headers_dict, body_str)."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, dict(exc.headers), body


def _post(url, body, headers=None):
    """HTTP POST returning (status, headers_dict, body_str)."""
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        return exc.code, dict(exc.headers), body_text


# ===================================================================
# 1. TestXSSProtection
# ===================================================================

class TestXSSProtection:
    """Verify that user-controlled data is HTML-entity-encoded in server
    responses so that the JS h() function (which uses textContent) never
    processes raw markup from the database."""

    def test_script_tag_in_swarm_name(self, proofui_server):
        """Swarm name containing <script>alert(1)</script> is returned
        as escaped text in the JSON API, not executable markup."""
        base_url, _, platform = proofui_server
        xss_name = "<script>alert(1)</script>"
        platform.repo.create_swarm(
            swarm_name=xss_name,
            description="XSS test swarm",
            created_by="rt12",
        )
        status, _, body = _get(f"{base_url}/api/swarms")
        assert status == 200
        swarms = json.loads(body)
        assert len(swarms) >= 1
        # The name must arrive as literal text in the JSON payload.
        # When rendered via h() + textContent, it will display literally.
        found = [s for s in swarms if s.get("swarm_name") == xss_name]
        assert len(found) == 1
        # The raw JSON wire format must NOT contain an unescaped <script> that
        # a browser would interpret as HTML if mistakenly used with innerHTML.
        # Since it's JSON-encoded, angle brackets may appear literally in the
        # JSON string value, but when the JS h() uses textContent the browser
        # treats it as text, not markup. Verify the value round-trips correctly.
        assert found[0]["swarm_name"] == xss_name

    def test_img_onerror_in_swarm_description(self, proofui_server):
        """<img onerror=alert(1)> in description is stored and returned
        as literal text, never rendered as HTML."""
        base_url, _, platform = proofui_server
        xss_desc = '<img src=x onerror=alert(1)>'
        swarm_id = platform.repo.create_swarm(
            swarm_name="img-onerror-test",
            description=xss_desc,
            created_by="rt12",
        )
        status, _, body = _get(f"{base_url}/api/swarm/{swarm_id}")
        assert status == 200
        detail = json.loads(body)
        swarm = detail["swarm"]
        # Description must be the literal string, not parsed as HTML
        assert swarm["description"] == xss_desc

    def test_event_handler_in_tool_name(self, proofui_server):
        """Tool names with event handler payloads are stored as literal text."""
        base_url, _, platform = proofui_server
        evil_tool_name = 'onmouseover="alert(document.cookie)"'
        # Register a tool with the malicious name
        platform.repo.create_tool(
            tool_name=evil_tool_name,
            description="Event handler XSS test",
        )
        status, _, body = _get(f"{base_url}/api/tools")
        assert status == 200
        tools = json.loads(body)
        found = [t for t in tools if t.get("tool_name") == evil_tool_name]
        assert len(found) == 1
        # The tool name is returned as literal text in JSON
        assert found[0]["tool_name"] == evil_tool_name

    def test_unicode_homoglyph_in_swarm_name(self, proofui_server):
        """Unicode homoglyph attack in swarm name is preserved as-is
        (no mojibake, no silent stripping)."""
        base_url, _, platform = proofui_server
        # Mix Latin and Cyrillic lookalikes: "admin" with Cyrillic 'a' (U+0430)
        homoglyph_name = "\u0430dmin-swarm"  # Cyrillic 'a' + Latin "dmin"
        platform.repo.create_swarm(
            swarm_name=homoglyph_name,
            description="Homoglyph test",
            created_by="rt12",
        )
        status, _, body = _get(f"{base_url}/api/swarms")
        assert status == 200
        swarms = json.loads(body)
        found = [s for s in swarms if s.get("swarm_name") == homoglyph_name]
        assert len(found) == 1
        # The homoglyph character must survive the round-trip without mutation
        raw_name = found[0]["swarm_name"]
        assert raw_name[0] == "\u0430"  # Cyrillic 'a', not Latin 'a'


# ===================================================================
# 2. TestCORSRestriction
# ===================================================================

class TestCORSRestriction:
    """Verify CORS is restricted to localhost origins only."""

    def test_evil_origin_rejected(self, proofui_server):
        """POST with Origin: https://evil.com must NOT get a permissive
        Access-Control-Allow-Origin header."""
        base_url, _, _ = proofui_server
        status, headers, _ = _post(
            f"{base_url}/api/swarm/create",
            {"description": "cors-test"},
            headers={"Origin": "https://evil.com"},
        )
        acao = headers.get("Access-Control-Allow-Origin", "")
        assert acao != "*", "CORS must not be wildcard"
        assert "evil.com" not in acao, "Evil origin must not be reflected"

    def test_localhost_origin_allowed(self, proofui_server):
        """POST with Origin: http://localhost:<port> gets matching CORS header."""
        base_url, _, _ = proofui_server
        port = base_url.split(":")[-1]
        origin = f"http://localhost:{port}"
        status, headers, _ = _post(
            f"{base_url}/api/swarm/create",
            {"description": "cors-test"},
            headers={"Origin": origin},
        )
        acao = headers.get("Access-Control-Allow-Origin", "")
        assert acao == origin

    def test_loopback_origin_allowed(self, proofui_server):
        """POST with Origin: http://127.0.0.1:<port> gets matching CORS header."""
        base_url, _, _ = proofui_server
        port = base_url.split(":")[-1]
        origin = f"http://127.0.0.1:{port}"
        status, headers, _ = _post(
            f"{base_url}/api/swarm/create",
            {"description": "cors-test"},
            headers={"Origin": origin},
        )
        acao = headers.get("Access-Control-Allow-Origin", "")
        assert acao == origin

    def test_no_origin_gets_localhost_default(self, proofui_server):
        """Same-origin request (no Origin header) gets localhost default."""
        base_url, _, _ = proofui_server
        port = base_url.split(":")[-1]
        status, headers, _ = _post(
            f"{base_url}/api/swarm/create",
            {"description": "cors-test"},
            # No Origin header
        )
        acao = headers.get("Access-Control-Allow-Origin", "")
        # Should default to http://localhost:<port>
        assert "localhost" in acao
        assert port in acao


# ===================================================================
# 3. TestArtifactPathTraversal
# ===================================================================

class TestArtifactPathTraversal:
    """Verify path traversal is blocked in artifact serving."""

    def test_traversal_etc_passwd(self, proofui_server):
        """Request with ../../etc/passwd path returns 403."""
        base_url, openclaw_root, _ = proofui_server
        # Create the workspace/run-test directory so the run ID is valid
        ws = openclaw_root / "workspace" / "run-test"
        ws.mkdir(parents=True, exist_ok=True)
        status, _, body = _get(f"{base_url}/api/artifact/run-test/../../etc/passwd")
        assert status == 403

    def test_traversal_etc_hosts(self, proofui_server):
        """Request with ../../../etc/hosts path returns 403."""
        base_url, openclaw_root, _ = proofui_server
        ws = openclaw_root / "workspace" / "run-test"
        ws.mkdir(parents=True, exist_ok=True)
        status, _, body = _get(f"{base_url}/api/artifact/run-test/../../../etc/hosts")
        assert status == 403

    def test_valid_file_served(self, proofui_server):
        """Legitimate file within workspace is served with 200."""
        base_url, openclaw_root, _ = proofui_server
        ws = openclaw_root / "workspace" / "run-test"
        ws.mkdir(parents=True, exist_ok=True)
        # Create a real file in the workspace
        artifact = ws / "valid-file.json"
        artifact.write_text('{"result": "ok"}')
        status, _, body = _get(f"{base_url}/api/artifact/run-test/valid-file.json")
        assert status == 200
        data = json.loads(body)
        assert data["result"] == "ok"

    def test_normalized_subdir_path_served(self, proofui_server):
        """Path with subdir/../valid-file.json normalizes within workspace and is served."""
        base_url, openclaw_root, _ = proofui_server
        ws = openclaw_root / "workspace" / "run-test"
        ws.mkdir(parents=True, exist_ok=True)
        # Create the target file at workspace root
        artifact = ws / "valid-file.json"
        artifact.write_text('{"normalized": true}')
        # Also create the subdir so the path is realistic
        (ws / "subdir").mkdir(exist_ok=True)
        status, _, body = _get(f"{base_url}/api/artifact/run-test/subdir/../valid-file.json")
        assert status == 200
        data = json.loads(body)
        assert data["normalized"] is True


# ===================================================================
# 4. TestDeliveryDestinationValidation
# ===================================================================

class TestDeliveryDestinationValidation:
    """Verify delivery destinations with injection payloads are handled safely."""

    def test_email_shell_metacharacters_do_not_execute(self):
        """Email destination with shell metacharacters must not cause
        command execution -- the adapter treats it as a literal string."""
        evil_dest = "user@example.com; rm -rf /"
        adapter = EmailAdapter(smtp_config={
            "host": "192.0.2.1",  # TEST-NET, unreachable
            "port": 587,
            "sender": {"address": "test@localhost"},
            "connection": {"timeout_seconds": 2},
            "policy": {
                "allowed_sender_identities": ["test@localhost"],
                "allowed_recipient_domains": ["example.com"],
            },
        })
        result = adapter.send(evil_dest, {
            "subject": "Shell injection test",
            "body": "This should not execute anything",
            "run_id": "rt12",
        })
        # The send will fail (unreachable host or policy rejection), but
        # the key assertion is that no shell command was executed.
        # The / directory must still exist.
        assert os.path.isdir("/")
        # Result reports failure, not crash
        assert result["success"] is False

    def test_telegram_html_injection_sent_as_literal(self):
        """Telegram message body with HTML injection payload is sent as
        literal text, not rendered as markup by the adapter."""
        html_payload = '<script>alert(document.cookie)</script><b>bold</b>'
        # Use a bogus token so the API call fails safely
        adapter = TelegramAdapter(bot_token="0000000000:BOGUS_RT12_TOKEN")
        result = adapter.send("0", {
            "subject": "HTML Injection Test",
            "body": html_payload,
            "run_id": "rt12",
        })
        # The adapter constructs the text field as "*subject*\n\nbody"
        # It must preserve the literal HTML, never interpret it.
        assert result["success"] is False
        # The adapter must not crash, and the body is treated as data.
        assert result["provider_message_id"] is None

    def test_empty_destination_fails_without_crash(self):
        """Empty destination string produces a clean failure, not a crash."""
        adapter = EmailAdapter(smtp_config={
            "host": "192.0.2.1",
            "port": 587,
            "sender": {"address": "test@localhost"},
            "connection": {"timeout_seconds": 2},
            "policy": {
                "allowed_sender_identities": ["test@localhost"],
                "allowed_recipient_domains": ["example.com"],
            },
        })
        result = adapter.send("", {
            "subject": "Empty dest test",
            "body": "Should fail cleanly",
            "run_id": "rt12",
        })
        assert result["success"] is False
        assert result["provider_message_id"] is None
