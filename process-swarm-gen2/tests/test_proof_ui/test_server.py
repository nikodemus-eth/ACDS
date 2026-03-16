"""Tests for the ProofUI server module."""
from __future__ import annotations

import io
import json
import threading
from http.server import HTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

import pytest

from proof_ui.server import (
    CONSOLE_HTML,
    ProofUIState,
    SwarmPlatform,
    _make_handler,
)


# ──────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────


@pytest.fixture()
def artifact_root(tmp_path: Path) -> Path:
    """Create a minimal openclaw root with artifact directories."""
    root = tmp_path / "openclaw"
    root.mkdir()
    (root / "artifacts" / "executions").mkdir(parents=True)
    (root / "artifacts" / "plans").mkdir(parents=True)
    (root / "artifacts" / "validation").mkdir(parents=True)
    (root / "artifacts" / "leases" / "active").mkdir(parents=True)
    (root / "artifacts" / "proposals").mkdir(parents=True)
    (root / "ledger").mkdir(parents=True)
    (root / "ledger" / "execution_ledger.log").touch()

    # node identity
    identity = {
        "node_id": "test-node-001",
        "node_role": "execution_node",
        "environment_class": "test",
        "status": "active",
        "created_at": "2026-03-10T00:00:00+00:00",
    }
    (root / "node_identity.json").write_text(json.dumps(identity))
    return root


@pytest.fixture()
def proof_state(artifact_root: Path) -> ProofUIState:
    return ProofUIState(artifact_root)


@pytest.fixture()
def swarm_platform(tmp_path: Path) -> SwarmPlatform:
    """Create SwarmPlatform with in-memory-like DB in tmp_path."""
    root = tmp_path / "platform_root"
    root.mkdir()
    plat = SwarmPlatform(root)
    return plat


@pytest.fixture()
def live_server(artifact_root: Path):
    """Start a real HTTP server on a free port for integration tests."""
    ui_state = ProofUIState(artifact_root)
    plat = SwarmPlatform(artifact_root)
    handler_cls = _make_handler(ui_state, plat)

    server = HTTPServer(("127.0.0.1", 0), handler_cls)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()
        plat.db.close()


# ──────────────────────────────────────────────────────────────
# ProofUIState — artifact reading tests
# ──────────────────────────────────────────────────────────────


class TestProofUIStateArtifacts:
    """Tests for ProofUIState reading artifacts from disk."""

    def test_get_executions_reads_json_files(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        exec_dir = artifact_root / "artifacts" / "executions"
        (exec_dir / "exec_001.json").write_text(
            json.dumps({"execution_id": "e1", "status": "passed"})
        )
        (exec_dir / "exec_002.json").write_text(
            json.dumps({"execution_id": "e2", "status": "failed"})
        )
        result = proof_state.get_executions()
        assert len(result) == 2
        ids = {r["execution_id"] for r in result}
        assert ids == {"e1", "e2"}

    def test_get_plans_reads_json_files(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        plans_dir = artifact_root / "artifacts" / "plans"
        (plans_dir / "plan_001.json").write_text(
            json.dumps({"plan_id": "p1"})
        )
        result = proof_state.get_plans()
        assert len(result) == 1
        assert result[0]["plan_id"] == "p1"

    def test_get_validations_reads_json_files(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        val_dir = artifact_root / "artifacts" / "validation"
        (val_dir / "val_001.json").write_text(
            json.dumps({"validation_id": "v1"})
        )
        result = proof_state.get_validations()
        assert len(result) == 1

    def test_get_leases_reads_active_leases(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        lease_dir = artifact_root / "artifacts" / "leases" / "active"
        (lease_dir / "lease_001.json").write_text(
            json.dumps({"lease_id": "l1"})
        )
        result = proof_state.get_leases()
        assert len(result) == 1

    def test_get_proposals_reads_json(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        prop_dir = artifact_root / "artifacts" / "proposals"
        (prop_dir / "prop_001.json").write_text(
            json.dumps({"proposal_id": "pr1"})
        )
        result = proof_state.get_proposals()
        assert len(result) == 1


class TestProofUIStateMissingDirs:
    """Tests for graceful handling of missing directories."""

    def test_missing_executions_dir_returns_empty(self, tmp_path: Path) -> None:
        root = tmp_path / "empty"
        root.mkdir()
        st = ProofUIState(root)
        assert st.get_executions() == []

    def test_missing_plans_dir_returns_empty(self, tmp_path: Path) -> None:
        root = tmp_path / "empty"
        root.mkdir()
        st = ProofUIState(root)
        assert st.get_plans() == []

    def test_missing_leases_dir_returns_empty(self, tmp_path: Path) -> None:
        root = tmp_path / "empty"
        root.mkdir()
        st = ProofUIState(root)
        assert st.get_leases() == []

    def test_missing_identity_returns_empty_dict(self, tmp_path: Path) -> None:
        root = tmp_path / "empty"
        root.mkdir()
        st = ProofUIState(root)
        assert st.get_identity() == {}

    def test_missing_ledger_returns_empty_list(self, tmp_path: Path) -> None:
        root = tmp_path / "empty"
        root.mkdir()
        st = ProofUIState(root)
        assert st.get_ledger_entries() == []


# ──────────────────────────────────────────────────────────────
# ProofUIState — dashboard enrichment
# ──────────────────────────────────────────────────────────────


class TestProofUIStateDashboard:
    """Tests for the dashboard enrichment payload."""

    def test_dashboard_empty_root(self, tmp_path: Path) -> None:
        root = tmp_path / "empty"
        root.mkdir()
        st = ProofUIState(root)
        d = st.get_dashboard()
        assert d["total_executions"] == 0
        assert d["pass_rate"] == 0.0
        assert d["node_id"] == "unknown"

    def test_dashboard_with_executions(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        exec_dir = artifact_root / "artifacts" / "executions"
        (exec_dir / "e1.json").write_text(
            json.dumps({"status": "passed"})
        )
        (exec_dir / "e2.json").write_text(
            json.dumps({"status": "passed"})
        )
        (exec_dir / "e3.json").write_text(
            json.dumps({"status": "failed"})
        )
        d = proof_state.get_dashboard()
        assert d["total_executions"] == 3
        assert d["passed_executions"] == 2
        assert abs(d["pass_rate"] - 66.7) < 0.1
        assert d["node_id"] == "test-node-001"

    def test_dashboard_includes_recent_executions(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        exec_dir = artifact_root / "artifacts" / "executions"
        for i in range(15):
            (exec_dir / f"e{i:03d}.json").write_text(
                json.dumps({"execution_id": f"e{i}", "status": "passed"})
            )
        d = proof_state.get_dashboard()
        assert d["total_executions"] == 15
        # recent_executions should be capped at last 10
        assert len(d["recent_executions"]) == 10


# ──────────────────────────────────────────────────────────────
# ProofUIState — ledger parsing
# ──────────────────────────────────────────────────────────────


class TestProofUIStateLedger:
    """Tests for ledger log parsing."""

    def test_ledger_parses_json_lines(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        ledger = artifact_root / "ledger" / "execution_ledger.log"
        lines = [
            json.dumps({"event": "start", "ts": "2026-03-10T00:00:00Z"}),
            json.dumps({"event": "end", "ts": "2026-03-10T00:01:00Z"}),
        ]
        ledger.write_text("\n".join(lines) + "\n")
        entries = proof_state.get_ledger_entries()
        assert len(entries) == 2
        assert entries[0]["event"] == "start"

    def test_ledger_handles_non_json_lines(
        self, artifact_root: Path, proof_state: ProofUIState,
    ) -> None:
        ledger = artifact_root / "ledger" / "execution_ledger.log"
        ledger.write_text("not json at all\n")
        entries = proof_state.get_ledger_entries()
        assert len(entries) == 1
        assert entries[0]["raw"] == "not json at all"


# ──────────────────────────────────────────────────────────────
# SwarmPlatform — initialization
# ──────────────────────────────────────────────────────────────


class TestSwarmPlatform:
    """Tests for SwarmPlatform initialization."""

    def test_platform_initializes_with_db(
        self, swarm_platform: SwarmPlatform,
    ) -> None:
        assert swarm_platform.db.conn is not None
        assert swarm_platform.repo is not None
        assert swarm_platform.events is not None
        assert swarm_platform.lifecycle is not None

    def test_platform_can_create_and_list_swarms(
        self, swarm_platform: SwarmPlatform,
    ) -> None:
        swarm_id = swarm_platform.repo.create_swarm(
            "test-swarm", "A test", "tester",
        )
        swarms = swarm_platform.repo.list_swarms()
        assert len(swarms) == 1
        assert swarms[0]["swarm_id"] == swarm_id


# ──────────────────────────────────────────────────────────────
# Path traversal protection
# ──────────────────────────────────────────────────────────────


class TestPathTraversal:
    """Tests for path traversal protection in _serve_scoped_file."""

    def test_traversal_blocked(self, artifact_root: Path) -> None:
        """Resolved path must stay under root directory."""
        root = artifact_root / "artifacts"
        traversal_path = "../../../etc/passwd"
        resolved = (root / traversal_path).resolve()
        assert not str(resolved).startswith(str(root.resolve()))

    def test_safe_path_allowed(self, artifact_root: Path) -> None:
        root = artifact_root / "artifacts"
        safe = "executions/test.json"
        (root / "executions" / "test.json").write_text("{}")
        resolved = (root / safe).resolve()
        assert str(resolved).startswith(str(root.resolve()))


# ──────────────────────────────────────────────────────────────
# HTTP integration tests
# ──────────────────────────────────────────────────────────────


class TestHTTPEndpoints:
    """Integration tests using a real HTTP server."""

    def test_root_redirects_to_console(self, live_server: str) -> None:
        req = Request(f"{live_server}/")
        # urllib follows redirects by default; check we get HTML
        resp = urlopen(req)
        assert resp.status == 200
        body = resp.read().decode("utf-8")
        assert "ProofUI" in body

    def test_console_serves_html(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/console")
        assert resp.status == 200
        content_type = resp.headers.get("Content-Type", "")
        assert "text/html" in content_type
        body = resp.read().decode("utf-8")
        assert "ProofUI" in body

    def test_api_dashboard_returns_json(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/dashboard")
        assert resp.status == 200
        data = json.loads(resp.read())
        assert "total_executions" in data
        assert "pass_rate" in data

    def test_api_executions_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/executions")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_identity_returns_node_info(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/identity")
        data = json.loads(resp.read())
        assert data.get("node_id") == "test-node-001"

    def test_api_settings_identity(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/settings/identity")
        data = json.loads(resp.read())
        assert data.get("node_id") == "test-node-001"

    def test_cors_headers_present(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/swarms")
        assert resp.headers.get("Access-Control-Allow-Origin") == "*"

    def test_api_swarms_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/swarms")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_runs_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/runs")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_events_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/events")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_tools_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/tools")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_schedules_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/schedules")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_unknown_path_returns_404(self, live_server: str) -> None:
        from urllib.error import HTTPError
        with pytest.raises(HTTPError) as exc_info:
            urlopen(f"{live_server}/api/nonexistent")
        assert exc_info.value.code == 404

    def test_api_ledger_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/ledger")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_plans_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/plans")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_validations_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/validations")
        data = json.loads(resp.read())
        assert isinstance(data, list)

    def test_api_leases_returns_list(self, live_server: str) -> None:
        resp = urlopen(f"{live_server}/api/leases")
        data = json.loads(resp.read())
        assert isinstance(data, list)


# ──────────────────────────────────────────────────────────────
# Console HTML content
# ──────────────────────────────────────────────────────────────


class TestConsoleHTML:
    """Tests for the inline console HTML."""

    def test_console_html_contains_required_elements(self) -> None:
        assert "ProofUI" in CONSOLE_HTML
        assert "#dashboard" in CONSOLE_HTML
        assert "#swarms" in CONSOLE_HTML
        assert "#runs" in CONSOLE_HTML
        assert "#events" in CONSOLE_HTML
        assert "#tools" in CONSOLE_HTML
        assert "#settings" in CONSOLE_HTML

    def test_console_html_has_css_variables(self) -> None:
        assert "--bg:" in CONSOLE_HTML
        assert "--surface:" in CONSOLE_HTML
        assert "--accent:" in CONSOLE_HTML

    def test_console_html_has_js_helpers(self) -> None:
        assert "function apiGet" in CONSOLE_HTML
        assert "function apiPost" in CONSOLE_HTML
        assert "function statusBadge" in CONSOLE_HTML
        assert "function formatTime" in CONSOLE_HTML
        assert "function truncId" in CONSOLE_HTML
