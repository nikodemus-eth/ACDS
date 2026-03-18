"""Integration tests for ARGUS-Hold with multi-command pipelines."""

from __future__ import annotations

import json
from pathlib import Path

from swarm.argus_hold.config import ARGUSHoldConfig
from swarm.argus_hold.dispatcher import ARGUSHoldDispatcher
from swarm.argus_hold.ledger_writer import LedgerWriter


def _make_dispatcher(tmp_path):
    cfg = ARGUSHoldConfig.for_run(tmp_path, "run-integ")
    ws = tmp_path / "workspace" / "run-integ"
    ws.mkdir(parents=True)
    return ARGUSHoldDispatcher(cfg), ws, cfg


class TestMultiCommandPipeline:
    """Integration tests running multiple commands through the dispatcher."""

    def test_write_then_read(self, tmp_path):
        disp, ws, cfg = _make_dispatcher(tmp_path)

        # Write a file
        write_action = {
            "tool_name": "filesystem.write_file",
            "config": {"path": "data.txt", "content": "integration test content"},
        }
        w_result = disp.execute("run-integ", "swarm-integ", write_action, ws, {})
        assert w_result.success is True

        # Read it back
        read_action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "data.txt"},
        }
        r_result = disp.execute("run-integ", "swarm-integ", read_action, ws, {})
        assert r_result.success is True
        assert r_result.output_data["content"] == "integration test content"

    def test_write_then_list_dir(self, tmp_path):
        disp, ws, cfg = _make_dispatcher(tmp_path)

        for name in ["alpha.txt", "beta.txt", "gamma.txt"]:
            action = {
                "tool_name": "filesystem.write_file",
                "config": {"path": name, "content": f"content of {name}"},
            }
            result = disp.execute("run-integ", "swarm-integ", action, ws, {})
            assert result.success is True

        list_action = {
            "tool_name": "filesystem.list_dir",
            "config": {"path": "."},
        }
        lr = disp.execute("run-integ", "swarm-integ", list_action, ws, {})
        assert lr.success is True
        entries = lr.output_data["entries"]
        assert "alpha.txt" in entries
        assert "beta.txt" in entries
        assert "gamma.txt" in entries


class TestLedgerChainIntegrity:
    """Verify ledger chain stays valid across multiple commands."""

    def test_chain_valid_after_mixed_outcomes(self, tmp_path):
        disp, ws, cfg = _make_dispatcher(tmp_path)

        # Successful command
        (ws / "ok.txt").write_text("ok")
        disp.execute("run-integ", "swarm-integ", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "ok.txt"},
        }, ws, {})

        # Failed validation
        disp.execute("run-integ", "swarm-integ", {
            "tool_name": "filesystem.read_file",
            "config": {},
        }, ws, {})

        # Another successful command
        disp.execute("run-integ", "swarm-integ", {
            "tool_name": "filesystem.write_file",
            "config": {"path": "new.txt", "content": "new file"},
        }, ws, {})

        # Verify chain integrity
        ledger_path = Path(cfg.ledger_root) / "argus_hold_ledger.jsonl"
        violations = LedgerWriter.verify_chain(ledger_path)
        assert violations == [], f"Chain violations: {violations}"


class TestArtifactConsistency:
    """Verify artifact files exist and are valid JSON."""

    def test_all_artifacts_valid_json(self, tmp_path):
        disp, ws, cfg = _make_dispatcher(tmp_path)
        (ws / "test.txt").write_text("hello")
        result = disp.execute("run-integ", "swarm-integ", {
            "tool_name": "filesystem.read_file",
            "config": {"path": "test.txt"},
        }, ws, {})
        for artifact_path in result.artifacts_produced:
            p = Path(artifact_path)
            assert p.exists(), f"Artifact missing: {p}"
            data = json.loads(p.read_text())
            assert isinstance(data, dict)
