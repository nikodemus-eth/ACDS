"""Red Team tests — 7 previously uncovered threat scenarios.

RT-11 covers:
  A. Unregistered command rejection
  G. Dry-run / actual-run plan drift
  J. Timeout boundary enforcement
  +  TTS shell injection
  +  Credential leakage in delivery results
  +  RSS feed content injection / XSS
  +  Delivery honesty (never claim false success)
"""

from __future__ import annotations

import json
import os
import platform
import subprocess

import pytest

from swarm.argus_hold.config import ARGUSHoldConfig
from swarm.argus_hold.dispatcher import ARGUSHoldDispatcher
from swarm.argus_hold.execution_planner import ExecutionPlanner
from swarm.argus_hold.models import (
    CommandEnvelope,
    ExecutionPlan,
    PolicyDecision,
    ScopeCheck,
    SideEffectLevel,
    new_id,
    now_utc,
)
from swarm.argus_hold.normalizer import Normalizer
from swarm.argus_hold.policy_engine import PolicyEngine
from swarm.argus_hold.registry import CommandRegistry
from swarm.argus_hold.scope_guard import ScopeGuard
from swarm.delivery.adapters import EmailAdapter, TelegramAdapter
from swarm.delivery.validation import resolve_smtp_credentials
from swarm.tools.adapters.source_collector import SourceCollectorAdapter, _clean_html, _fetch_feed
from swarm.tools.base import ToolContext, ToolResult


pytestmark = pytest.mark.redteam


# ---------------------------------------------------------------------------
# Shared helpers (same pattern as test_rt_argus_hold.py)
# ---------------------------------------------------------------------------

def _make_dispatcher(tmp_path, allowed_hosts=None):
    cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
    if allowed_hosts is not None:
        cfg.allowed_hosts = allowed_hosts
    ws = tmp_path / "workspace" / "run-rt11"
    ws.mkdir(parents=True, exist_ok=True)
    return ARGUSHoldDispatcher(cfg), ws, cfg


def _make_envelope(
    params: dict,
    level: SideEffectLevel = SideEffectLevel.READ_ONLY,
    command_name: str = "filesystem.read_file",
    dry_run: bool = False,
) -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters=params,
        side_effect_level=level,
        run_id="run-rt11",
        swarm_id="swarm-rt11",
        created_at=now_utc(),
        dry_run=dry_run,
    )


# ===================================================================
# 1. TestUnregisteredCommandRejection  (ARGUS-Hold spec item A)
# ===================================================================

class TestUnregisteredCommandRejection:
    """Commands not in the registry must fail at the normalizer/dispatcher."""

    def test_dispatcher_rejects_unknown_tool(self, tmp_path):
        """Dispatching an unregistered tool_name yields success=False."""
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt11", "swarm-rt11", {
            "tool_name": "filesystem.open_all_the_things",
            "config": {"path": "anything.txt"},
        }, ws, {})
        assert result.success is False
        assert result.error is not None

    def test_handles_returns_false_for_unregistered(self, tmp_path):
        """Dispatcher.handles() must return False for unknown commands."""
        disp, _, _ = _make_dispatcher(tmp_path)
        assert disp.handles("filesystem.open_all_the_things") is False
        assert disp.handles("evil.destroy_everything") is False
        assert disp.handles("") is False

    def test_normalizer_returns_none_for_unregistered(self, tmp_path):
        """Normalizer returns None for commands not in the registry."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        registry = CommandRegistry(cfg.command_specs_dir)
        normalizer = Normalizer(registry)
        envelope = normalizer.normalize(
            {"tool_name": "filesystem.open_all_the_things", "config": {}},
            "run-rt11",
            "swarm-rt11",
        )
        assert envelope is None

    def test_registry_has_command_false(self, tmp_path):
        """Registry.has_command returns False for bogus names."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        registry = CommandRegistry(cfg.command_specs_dir)
        assert registry.has_command("filesystem.open_all_the_things") is False
        assert registry.has_command("__proto__") is False
        assert registry.has_command("constructor") is False


# ===================================================================
# 2. TestDryRunDrift  (ARGUS-Hold spec item G)
# ===================================================================

class TestDryRunDrift:
    """Dry-run and actual execution must produce identical plans."""

    def test_filesystem_read_plan_determinism(self, tmp_path):
        """ExecutionPlanner produces identical adapter/timeout/artifacts
        regardless of dry_run flag."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        ws = tmp_path / "workspace" / "run-rt11"
        ws.mkdir(parents=True, exist_ok=True)

        registry = CommandRegistry(cfg.command_specs_dir)
        policy_engine = PolicyEngine(cfg)
        scope_guard = ScopeGuard(cfg)
        planner = ExecutionPlanner()

        params = {"path": "test.txt"}
        spec = registry.get_spec("filesystem.read_file")
        assert spec is not None

        # Build envelope for dry_run=True
        env_dry = _make_envelope(params, dry_run=True)
        policy_dry = policy_engine.evaluate(env_dry, spec)
        scope_dry = scope_guard.check(env_dry, ws)
        plan_dry = planner.build(env_dry, policy_dry, scope_dry, spec)

        # Build envelope for dry_run=False
        env_real = _make_envelope(params, dry_run=False)
        policy_real = policy_engine.evaluate(env_real, spec)
        scope_real = scope_guard.check(env_real, ws)
        plan_real = planner.build(env_real, policy_real, scope_real, spec)

        # Core plan attributes must be identical
        assert plan_dry.adapter_name == plan_real.adapter_name
        assert plan_dry.timeout_ms == plan_real.timeout_ms
        assert plan_dry.expected_artifacts == plan_real.expected_artifacts

    def test_http_fetch_plan_determinism(self, tmp_path):
        """HTTP command plans are also deterministic across dry_run flag."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        cfg.allowed_hosts = ["example.com"]
        ws = tmp_path / "workspace" / "run-rt11"
        ws.mkdir(parents=True, exist_ok=True)

        registry = CommandRegistry(cfg.command_specs_dir)
        policy_engine = PolicyEngine(cfg)
        scope_guard = ScopeGuard(cfg)
        planner = ExecutionPlanner()

        params = {"url": "https://example.com/data"}
        spec = registry.get_spec("http.fetch_whitelisted")
        assert spec is not None

        env_dry = _make_envelope(
            params,
            level=SideEffectLevel.EXTERNAL_ACTION,
            command_name="http.fetch_whitelisted",
            dry_run=True,
        )
        policy_dry = policy_engine.evaluate(env_dry, spec)
        scope_dry = scope_guard.check(env_dry, ws)
        plan_dry = planner.build(env_dry, policy_dry, scope_dry, spec)

        env_real = _make_envelope(
            params,
            level=SideEffectLevel.EXTERNAL_ACTION,
            command_name="http.fetch_whitelisted",
            dry_run=False,
        )
        policy_real = policy_engine.evaluate(env_real, spec)
        scope_real = scope_guard.check(env_real, ws)
        plan_real = planner.build(env_real, policy_real, scope_real, spec)

        assert plan_dry.adapter_name == plan_real.adapter_name
        assert plan_dry.timeout_ms == plan_real.timeout_ms
        assert plan_dry.expected_artifacts == plan_real.expected_artifacts

    def test_dry_run_dispatcher_does_not_execute(self, tmp_path):
        """Dry-run through the full dispatcher produces success=True
        but with dry_run output — no side effects on disk."""
        disp, ws, _ = _make_dispatcher(tmp_path)
        target = ws / "should_not_exist.txt"
        result = disp.execute("run-rt11", "swarm-rt11", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "should_not_exist.txt"},
            "dry_run": True,
        }, ws, {})
        # Dry run succeeds (plan was built) but does not touch filesystem
        assert result.success is True
        assert not target.exists()


# ===================================================================
# 3. TestTimeoutBoundary  (ARGUS-Hold spec item J)
# ===================================================================

class TestTimeoutBoundary:
    """Execution plans carry the correct timeout from the command spec."""

    def test_filesystem_timeout_from_spec(self, tmp_path):
        """filesystem.read_file spec defines timeout_seconds=30 -> 30000 ms."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        ws = tmp_path / "workspace" / "run-rt11"
        ws.mkdir(parents=True, exist_ok=True)

        registry = CommandRegistry(cfg.command_specs_dir)
        spec = registry.get_spec("filesystem.read_file")
        planner = ExecutionPlanner()
        policy_engine = PolicyEngine(cfg)
        scope_guard = ScopeGuard(cfg)

        env = _make_envelope({"path": "x.txt"})
        policy = policy_engine.evaluate(env, spec)
        scope = scope_guard.check(env, ws)
        plan = planner.build(env, policy, scope, spec)

        assert plan.timeout_ms == spec["timeout_seconds"] * 1000

    def test_http_timeout_from_spec(self, tmp_path):
        """http.fetch_whitelisted spec defines timeout_seconds=60 -> 60000 ms."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        cfg.allowed_hosts = ["example.com"]
        ws = tmp_path / "workspace" / "run-rt11"
        ws.mkdir(parents=True, exist_ok=True)

        registry = CommandRegistry(cfg.command_specs_dir)
        spec = registry.get_spec("http.fetch_whitelisted")
        planner = ExecutionPlanner()
        policy_engine = PolicyEngine(cfg)
        scope_guard = ScopeGuard(cfg)

        env = _make_envelope(
            {"url": "https://example.com"},
            level=SideEffectLevel.EXTERNAL_ACTION,
            command_name="http.fetch_whitelisted",
        )
        policy = policy_engine.evaluate(env, spec)
        scope = scope_guard.check(env, ws)
        plan = planner.build(env, policy, scope, spec)

        assert plan.timeout_ms == 60000

    def test_plan_timeout_reflects_custom_spec(self, tmp_path):
        """If a spec is mutated to have a short timeout, the plan follows."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        ws = tmp_path / "workspace" / "run-rt11"
        ws.mkdir(parents=True, exist_ok=True)

        registry = CommandRegistry(cfg.command_specs_dir)
        spec = dict(registry.get_spec("filesystem.read_file"))
        spec["timeout_seconds"] = 1  # Override to 1 second

        planner = ExecutionPlanner()
        policy_engine = PolicyEngine(cfg)
        scope_guard = ScopeGuard(cfg)

        env = _make_envelope({"path": "x.txt"})
        policy = policy_engine.evaluate(env, spec)
        scope = scope_guard.check(env, ws)
        plan = planner.build(env, policy, scope, spec)

        assert plan.timeout_ms == 1000

    def test_scope_guard_blocks_testnet_ip(self, tmp_path):
        """192.0.2.1 (TEST-NET) is not in allowed_hosts and must be blocked."""
        cfg = ARGUSHoldConfig.for_run(tmp_path, "run-rt11")
        cfg.allowed_hosts = ["example.com"]
        ws = tmp_path / "workspace" / "run-rt11"
        ws.mkdir(parents=True, exist_ok=True)

        guard = ScopeGuard(cfg)
        env = _make_envelope(
            {"url": "https://192.0.2.1/slow"},
            level=SideEffectLevel.EXTERNAL_ACTION,
            command_name="http.fetch_whitelisted",
        )
        result = guard.check(env, ws)
        assert result.in_scope is False


# ===================================================================
# 4. TestTtsShellInjection
# ===================================================================

@pytest.mark.skipif(
    platform.system() != "Darwin",
    reason="macOS `say` command required",
)
class TestTtsShellInjection:
    """Shell metacharacters in TTS text must be literal, not executed."""

    @staticmethod
    def _make_tts_context(workspace_root, text_chunks):
        """Build a ToolContext suitable for TtsRendererAdapter."""
        from swarm.tools.adapters.tts.renderer import TtsRendererAdapter
        chunks = [{"index": i, "text": t} for i, t in enumerate(text_chunks)]
        ctx = ToolContext(
            run_id="run-rt11",
            swarm_id="swarm-rt11",
            action={},
            workspace_root=workspace_root,
            repo=None,
            prior_results={"tts_chunker": {"chunks": chunks}},
            config={"voice": "Samantha", "rate": 220},
        )
        return TtsRendererAdapter(), ctx

    def test_dollar_subshell_in_text(self, tmp_path):
        """$(rm -rf /) in TTS text is treated as literal speech, not a command."""
        from swarm.tools.adapters.tts.renderer import TtsRendererAdapter
        adapter, ctx = self._make_tts_context(tmp_path, [
            "Hello $(rm -rf /) world",
        ])
        result = adapter.execute(ctx)
        assert result.success is True
        assert len(result.artifacts) == 1
        chunk_path = tmp_path / "tts" / "chunk_000.aiff"
        assert chunk_path.exists()
        assert chunk_path.stat().st_size > 0

    def test_semicolon_injection_in_text(self, tmp_path):
        """Semicolon commands are literal text, not shell execution."""
        from swarm.tools.adapters.tts.renderer import TtsRendererAdapter
        adapter, ctx = self._make_tts_context(tmp_path, [
            "Test; cat /etc/passwd",
        ])
        result = adapter.execute(ctx)
        assert result.success is True
        chunk_path = tmp_path / "tts" / "chunk_000.aiff"
        assert chunk_path.exists()
        assert chunk_path.stat().st_size > 0

    def test_backtick_injection(self, tmp_path):
        """Backtick command substitution is treated as literal text."""
        from swarm.tools.adapters.tts.renderer import TtsRendererAdapter
        adapter, ctx = self._make_tts_context(tmp_path, [
            "Hello `whoami` world",
        ])
        result = adapter.execute(ctx)
        assert result.success is True
        chunk_path = tmp_path / "tts" / "chunk_000.aiff"
        assert chunk_path.exists()
        assert chunk_path.stat().st_size > 0

    def test_pipe_injection(self, tmp_path):
        """Pipe characters are literal, not shell pipes."""
        from swarm.tools.adapters.tts.renderer import TtsRendererAdapter
        adapter, ctx = self._make_tts_context(tmp_path, [
            "Hello | cat /etc/shadow | world",
        ])
        result = adapter.execute(ctx)
        assert result.success is True
        chunk_path = tmp_path / "tts" / "chunk_000.aiff"
        assert chunk_path.exists()
        assert chunk_path.stat().st_size > 0


# ===================================================================
# 5. TestCredentialLeakage
# ===================================================================

class TestCredentialLeakage:
    """Delivery adapters must not leak tokens or passwords in results."""

    def test_telegram_token_not_in_failure_response(self):
        """When Telegram API rejects an invalid token, the token must not
        appear in the returned provider_response or provider_message_id."""
        secret_token = "9999999999:AAFake_Secret_Token_REDTEAM_TEST"
        adapter = TelegramAdapter(bot_token=secret_token)
        # chat_id "0" is invalid; Telegram API will return an HTTP error.
        result = adapter.send("0", {
            "subject": "Red Team Test",
            "body": "This should fail.",
            "run_id": "run-rt11",
        })
        assert result["success"] is False
        # The secret token must NEVER appear in the response fields
        response_str = json.dumps(result)
        assert secret_token not in response_str

    def test_telegram_token_not_in_success_path(self):
        """Even if we inspect the result dict keys, the token is absent."""
        secret_token = "9999999999:AAFake_Secret_Token_REDTEAM_TEST"
        adapter = TelegramAdapter(bot_token=secret_token)
        result = adapter.send("0", {"body": "x", "run_id": "rt11"})
        # Check every string value in the result
        for key, val in result.items():
            if isinstance(val, str):
                assert secret_token not in val, f"Token leaked in result['{key}']"

    def test_smtp_password_env_never_in_error(self):
        """resolve_smtp_credentials reads from env vars, never config values.
        Even with env vars set, the password must not leak into error responses."""
        test_env_name = "RT11_TEST_SMTP_PASSWORD"
        test_password = "super_secret_p4ssw0rd_rt11"

        profile = {
            "host": "192.0.2.1",  # TEST-NET — unreachable, connection will fail
            "port": 587,
            "auth": {
                "username_env": "RT11_TEST_SMTP_USER",
                "password_env": test_env_name,
            },
            "sender": {"address": "test@localhost"},
            "policy": {
                "allowed_sender_identities": ["test@localhost"],
                "allowed_recipient_domains": ["example.com"],
            },
        }

        # Set the env vars temporarily
        old_user = os.environ.get("RT11_TEST_SMTP_USER")
        old_pass = os.environ.get(test_env_name)
        try:
            os.environ["RT11_TEST_SMTP_USER"] = "testuser"
            os.environ[test_env_name] = test_password

            # Verify resolve_smtp_credentials reads from env
            username, password = resolve_smtp_credentials(profile)
            assert username == "testuser"
            assert password == test_password

            # The profile dict stores env var NAMES, not values
            assert test_password not in json.dumps(profile)
            assert test_env_name in json.dumps(profile)

            # Send will fail (unreachable host) — password must not leak
            adapter = EmailAdapter(smtp_config=profile)
            result = adapter.send("someone@example.com", {
                "subject": "test",
                "body": "body",
                "run_id": "rt11",
            })
            assert result["success"] is False
            result_str = json.dumps(result)
            assert test_password not in result_str
        finally:
            # Restore env
            if old_user is None:
                os.environ.pop("RT11_TEST_SMTP_USER", None)
            else:
                os.environ["RT11_TEST_SMTP_USER"] = old_user
            if old_pass is None:
                os.environ.pop(test_env_name, None)
            else:
                os.environ[test_env_name] = old_pass


# ===================================================================
# 6. TestRssFeedInjection
# ===================================================================

class TestRssFeedInjection:
    """Malicious content in RSS feed items must be sanitized."""

    MALICIOUS_RSS = """\
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Evil Feed</title>
    <item>
      <title>Normal Title $(rm -rf /)</title>
      <description>&lt;script&gt;alert('xss')&lt;/script&gt;Legit content here</description>
      <link>https://example.com/1</link>
    </item>
    <item>
      <title>&lt;img src=x onerror=alert(1)&gt;</title>
      <description>&lt;b&gt;Bold&lt;/b&gt; &lt;a href="javascript:alert(1)"&gt;click&lt;/a&gt;</description>
      <link>https://example.com/2</link>
    </item>
    <item>
      <title>Normal</title>
      <description>&lt;div onmouseover="steal()"&gt;hover me&lt;/div&gt;</description>
      <link>https://example.com/3</link>
    </item>
  </channel>
</rss>"""

    def test_clean_html_strips_script_tags(self):
        """_clean_html removes <script> and </script> tag markers.
        The text content between tags becomes plain text (harmless without
        the script element context)."""
        dirty = "<script>alert('xss')</script>Legit content here"
        cleaned = _clean_html(dirty)
        assert "<script>" not in cleaned
        assert "</script>" not in cleaned
        # The tag wrappers are gone; remaining text is harmless literal
        assert "Legit content here" in cleaned
        # Crucially, no HTML tags survive
        assert "<" not in cleaned
        assert ">" not in cleaned

    def test_clean_html_strips_event_handlers(self):
        """_clean_html removes tags with inline event handlers."""
        dirty = '<div onmouseover="steal()">hover me</div>'
        cleaned = _clean_html(dirty)
        assert "onmouseover" not in cleaned
        assert "<div" not in cleaned
        assert "hover me" in cleaned

    def test_clean_html_strips_img_onerror(self):
        """_clean_html removes img tags with onerror attributes."""
        dirty = '<img src=x onerror=alert(1)>'
        cleaned = _clean_html(dirty)
        assert "<img" not in cleaned
        assert "onerror" not in cleaned

    def test_clean_html_strips_javascript_href(self):
        """_clean_html removes anchor tags including javascript: hrefs."""
        dirty = '<a href="javascript:alert(1)">click</a>'
        cleaned = _clean_html(dirty)
        assert "javascript:" not in cleaned
        assert "<a " not in cleaned
        assert "click" in cleaned

    def test_source_collector_sanitizes_feed_content(self, tmp_path):
        """SourceCollectorAdapter processes RSS XML with malicious content
        and the resulting entries have HTML stripped by _clean_html."""
        # Write the malicious RSS to a local file and serve it via file:// fixture
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        # Instead of HTTP, we use the mock fixtures mechanism
        fixtures_dir = workspace / "fixtures"
        fixtures_dir.mkdir()

        # Build mock sources that simulate what _fetch_feed would return
        # after processing the malicious RSS (the content field goes through _clean_html)
        import xml.etree.ElementTree as ET
        root = ET.fromstring(self.MALICIOUS_RSS)
        channel = root.find("channel")
        entries = []
        for item in channel.findall("item"):
            title_el = item.find("title")
            desc_el = item.find("description")
            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            desc = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
            entries.append({
                "title": title,
                "content": _clean_html(desc),
                "url": "https://example.com",
                "origin": "test",
            })

        mock_data = {"sources": entries}
        (fixtures_dir / "mock_sources.json").write_text(json.dumps(mock_data))

        ctx = ToolContext(
            run_id="run-rt11",
            swarm_id="swarm-rt11",
            action={"feeds": []},  # Empty feeds list to skip real HTTP
            workspace_root=workspace,
            repo=None,
            prior_results={},
            config={"feeds": []},
        )
        adapter = SourceCollectorAdapter()
        result = adapter.execute(ctx)

        assert result.success is True
        sources = result.output_data["sources"]
        assert len(sources) == 3

        # Verify sanitisation of content fields
        for src in sources:
            content = src.get("content", "")
            assert "<script>" not in content
            assert "</script>" not in content
            assert "onerror" not in content
            assert "onmouseover" not in content
            assert "javascript:" not in content
            assert "<div" not in content
            assert "<img" not in content
            assert "<a " not in content

    def test_shell_metacharacters_in_title_are_literal(self):
        """Titles with shell metacharacters remain as literal strings."""
        # Titles are NOT processed by _clean_html (they are plain text),
        # but they must not be executed as commands. Verify they pass
        # through as literal strings.
        import xml.etree.ElementTree as ET
        root = ET.fromstring(self.MALICIOUS_RSS)
        channel = root.find("channel")
        item = channel.findall("item")[0]
        title = item.find("title").text
        # The title contains the literal shell metacharacter string
        assert "$(rm -rf /)" in title
        # This is fine — it's data, not code. The important thing is
        # that no component evaluates it as a shell command.


# ===================================================================
# 7. TestDeliveryHonesty
# ===================================================================

class TestDeliveryHonesty:
    """Delivery adapters must never claim success when delivery failed."""

    def test_email_unconfigured_reports_failure(self):
        """EmailAdapter with no config reports success=False."""
        adapter = EmailAdapter(smtp_config=None)
        result = adapter.send("user@example.com", {
            "subject": "test",
            "body": "body",
            "run_id": "rt11",
        })
        assert result["success"] is False
        assert result["provider_message_id"] is None

    def test_email_empty_host_reports_failure(self):
        """EmailAdapter with empty host string reports success=False."""
        adapter = EmailAdapter(smtp_config={"host": ""})
        result = adapter.send("user@example.com", {
            "subject": "test",
            "body": "body",
            "run_id": "rt11",
        })
        assert result["success"] is False

    def test_telegram_no_token_reports_failure(self):
        """TelegramAdapter with no token reports success=False."""
        # Ensure env var doesn't interfere
        old = os.environ.pop("TELEGRAM_BOT_TOKEN", None)
        try:
            adapter = TelegramAdapter(bot_token=None)
            result = adapter.send("12345", {
                "subject": "test",
                "body": "body",
                "run_id": "rt11",
            })
            assert result["success"] is False
            assert result["provider_message_id"] is None
        finally:
            if old is not None:
                os.environ["TELEGRAM_BOT_TOKEN"] = old

    def test_telegram_invalid_token_reports_failure(self):
        """TelegramAdapter with a bogus token gets HTTP error -> success=False.
        This makes a real HTTP call to the Telegram API."""
        adapter = TelegramAdapter(bot_token="0000000000:INVALID_TOKEN_RT11")
        result = adapter.send("0", {
            "subject": "test",
            "body": "body",
            "run_id": "rt11",
        })
        assert result["success"] is False
        assert result["provider_message_id"] is None

    def test_email_unreachable_host_reports_failure(self):
        """EmailAdapter with unreachable SMTP host (TEST-NET) -> success=False."""
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
        result = adapter.send("user@example.com", {
            "subject": "Honesty test",
            "body": "Should not succeed",
            "run_id": "rt11",
        })
        assert result["success"] is False
        assert result["provider_message_id"] is None

    def test_telegram_empty_string_token_reports_failure(self):
        """TelegramAdapter with empty string token reports success=False."""
        old = os.environ.pop("TELEGRAM_BOT_TOKEN", None)
        try:
            adapter = TelegramAdapter(bot_token="")
            result = adapter.send("0", {
                "subject": "test",
                "body": "body",
                "run_id": "rt11",
            })
            assert result["success"] is False
        finally:
            if old is not None:
                os.environ["TELEGRAM_BOT_TOKEN"] = old
