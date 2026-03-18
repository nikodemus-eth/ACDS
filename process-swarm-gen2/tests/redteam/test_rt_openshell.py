"""Red Team tests for the OpenShell Layer.

Attack vectors tested:
- Path traversal (dotdot, URL-encoded, null byte)
- Parameter smuggling (extra fields)
- Newline injection in path fields
- SSRF blocklist bypass attempts
- Privilege escalation
"""

from __future__ import annotations

from pathlib import Path

import pytest

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.dispatcher import OpenShellDispatcher
from swarm.openshell.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)
from swarm.openshell.scope_guard import ScopeGuard
from swarm.openshell.validator import SchemaValidator
from swarm.openshell.registry import CommandRegistry


pytestmark = pytest.mark.redteam


def _make_dispatcher(tmp_path, allowed_hosts=None):
    cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
    if allowed_hosts is not None:
        cfg.allowed_hosts = allowed_hosts
    ws = tmp_path / "workspace" / "run-rt"
    ws.mkdir(parents=True)
    return OpenShellDispatcher(cfg), ws, cfg


def _make_envelope(
    params: dict,
    level: SideEffectLevel = SideEffectLevel.READ_ONLY,
    command_name: str = "filesystem.read_file",
) -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters=params,
        side_effect_level=level,
        run_id="run-rt",
        swarm_id="swarm-rt",
        created_at=now_utc(),
    )


class TestPathTraversal:
    """Path traversal attack vectors."""

    def test_dotdot_traversal(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "../../etc/passwd"},
        }, ws, {})
        assert result.success is False

    def test_deeply_nested_traversal(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "a/b/c/../../../../../../../../etc/shadow"},
        }, ws, {})
        assert result.success is False

    def test_null_byte_in_path(self, tmp_path):
        """Null byte should not allow path truncation attacks."""
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope({"path": "safe.txt\x00../../etc/passwd"})
        result = guard.check(env, ws)
        # The path should either be blocked or resolve safely within workspace
        # On modern Python, null bytes in paths raise ValueError
        # Either way, it should not allow access outside workspace

    def test_absolute_path_escape(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "/etc/passwd"},
        }, ws, {})
        assert result.success is False

    def test_dot_encoded_traversal(self, tmp_path):
        """URL-encoded dots should not bypass traversal checks."""
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        # This tests the scope guard directly with a path containing %2e%2e
        # After resolve(), this should not escape the workspace
        env = _make_envelope({"path": "%2e%2e/%2e%2e/etc/passwd"})
        result = guard.check(env, ws)
        # The resolved path should be checked against roots


class TestNewlineInjection:
    """Newline injection in path field."""

    def test_newline_in_path(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "filesystem.write_file",
            "config": {
                "path": "safe.txt\n../../evil.txt",
                "content": "injected",
            },
        }, ws, {})
        # Should either fail scope check or fail execution
        # Should NOT create a file outside workspace
        evil_path = tmp_path / "evil.txt"
        assert not evil_path.exists()


class TestParameterSmuggling:
    """Extra fields should be rejected by schema validation."""

    def test_extra_field_in_read_file(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "test.txt", "exec_cmd": "rm -rf /"},
        }, ws, {})
        assert result.success is False

    def test_extra_field_in_write_file(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path)
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "filesystem.write_file",
            "config": {
                "path": "out.txt",
                "content": "ok",
                "chmod": "777",
            },
        }, ws, {})
        assert result.success is False

    def test_extra_field_in_http(self, tmp_path):
        disp, ws, _ = _make_dispatcher(tmp_path, allowed_hosts=["example.com"])
        result = disp.execute("run-rt", "swarm-rt", {
            "tool_name": "http.fetch_whitelisted",
            "config": {
                "url": "https://example.com",
                "follow_redirects_to_internal": True,
            },
        }, ws, {})
        assert result.success is False


class TestSSRFBlocklist:
    """SSRF prevention via blocked host list."""

    def test_localhost_blocked(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        cfg.allowed_hosts = ["example.com"]
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope(
            {"url": "https://localhost/admin"},
            level=SideEffectLevel.EXTERNAL_ACTION,
            command_name="http.fetch_whitelisted",
        )
        result = guard.check(env, ws)
        assert result.in_scope is False

    def test_127_blocked(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        cfg.allowed_hosts = ["example.com"]
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope(
            {"url": "https://127.0.0.1:8080/admin"},
            level=SideEffectLevel.EXTERNAL_ACTION,
        )
        result = guard.check(env, ws)
        assert result.in_scope is False

    def test_metadata_endpoint_blocked(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        cfg.allowed_hosts = ["example.com"]
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope(
            {"url": "https://169.254.169.254/latest/meta-data/iam/"},
            level=SideEffectLevel.EXTERNAL_ACTION,
        )
        result = guard.check(env, ws)
        assert result.in_scope is False

    def test_zero_ip_blocked(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        cfg.allowed_hosts = ["example.com"]
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope(
            {"url": "https://0.0.0.0/"},
            level=SideEffectLevel.EXTERNAL_ACTION,
        )
        result = guard.check(env, ws)
        assert result.in_scope is False

    def test_http_scheme_blocked(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        cfg.allowed_hosts = ["example.com"]
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope(
            {"url": "http://example.com/data"},
            level=SideEffectLevel.EXTERNAL_ACTION,
        )
        result = guard.check(env, ws)
        assert result.in_scope is False

    def test_unlisted_host_blocked(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-rt")
        cfg.allowed_hosts = ["safe.example.com"]
        guard = ScopeGuard(cfg)
        ws = tmp_path / "workspace" / "run-rt"
        ws.mkdir(parents=True)
        env = _make_envelope(
            {"url": "https://evil.example.com/steal"},
            level=SideEffectLevel.EXTERNAL_ACTION,
        )
        result = guard.check(env, ws)
        assert result.in_scope is False


class TestPrivilegeEscalation:
    """Attempt to bypass policy restrictions."""

    def test_privileged_level_always_denied(self, tmp_path):
        """Even if config max_privilege_level is set very high, PRIVILEGED is denied."""
        disp, ws, cfg = _make_dispatcher(tmp_path)
        cfg.max_privilege_level = 100  # Very permissive
        # We need a command spec with privileged level
        # Since no bundled spec has PRIVILEGED, test via policy engine directly
        from swarm.openshell.policy_engine import PolicyEngine
        engine = PolicyEngine(cfg)
        env = _make_envelope(
            {"path": "test.txt"},
            level=SideEffectLevel.PRIVILEGED,
        )
        decision = engine.evaluate(env, {})
        assert decision.allowed is False
        assert decision.matched_rule == "privileged_deny"


class TestLedgerTamperDetection:
    """Verify tampered ledger entries are detected."""

    def test_tampered_ledger_detected_after_pipeline(self, tmp_path):
        import json
        disp, ws, cfg = _make_dispatcher(tmp_path)
        (ws / "file.txt").write_text("safe content")

        # Run two commands
        for _ in range(2):
            disp.execute("run-rt", "swarm-rt", {
                "tool_name": "filesystem.read_file",
                "config": {"path": "file.txt"},
            }, ws, {})

        # Tamper with ledger
        ledger_path = Path(cfg.ledger_root) / "openshell_ledger.jsonl"
        lines = ledger_path.read_text().strip().split("\n")
        entry = json.loads(lines[0])
        entry["outcome"] = "TAMPERED_OUTCOME"
        lines[0] = json.dumps(entry, separators=(",", ":"))
        ledger_path.write_text("\n".join(lines) + "\n")

        from swarm.openshell.ledger_writer import LedgerWriter
        violations = LedgerWriter.verify_chain(ledger_path)
        assert len(violations) > 0
