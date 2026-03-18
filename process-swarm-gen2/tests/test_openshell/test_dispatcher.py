"""Tests for swarm.openshell.dispatcher — OpenShellDispatcher (full pipeline)."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import tempfile

import pytest

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.dispatcher import OpenShellDispatcher
from swarm.openshell.models import CommandResult, StageVerdict
from swarm.tools.base import ToolResult


def _make_dispatcher(tmp_path, allowed_hosts=None):
    """Create a dispatcher with workspace properly set up."""
    cfg = OpenShellConfig.for_run(tmp_path, "run-test")
    if allowed_hosts is not None:
        cfg.allowed_hosts = allowed_hosts
    # Create workspace
    ws = tmp_path / "workspace" / "run-test"
    ws.mkdir(parents=True)
    return OpenShellDispatcher(cfg), ws


class TestDispatcherHandles:
    """Tests for OpenShellDispatcher.handles()."""

    def test_handles_registered_command(self, tmp_path):
        disp, _ = _make_dispatcher(tmp_path)
        assert disp.handles("filesystem.read_file") is True

    def test_does_not_handle_unknown_command(self, tmp_path):
        disp, _ = _make_dispatcher(tmp_path)
        assert disp.handles("unknown.command") is False


class TestDispatcherReadFile:
    """End-to-end pipeline test for filesystem.read_file."""

    def test_read_file_success(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        (ws / "test.txt").write_text("file content here")
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "test.txt"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert isinstance(result, CommandResult)
        assert result.success is True
        assert result.output_data["content"] == "file content here"
        assert result.error is None
        # Should have 8 stage results
        assert len(result.stage_results) == 8
        stage_names = [s.stage_name for s in result.stage_results]
        assert "normalize" in stage_names
        assert "schema_validation" in stage_names
        assert "policy" in stage_names
        assert "scope" in stage_names
        assert "plan" in stage_names
        assert "execute" in stage_names
        assert "emit" in stage_names
        assert "ledger" in stage_names


class TestDispatcherWriteFile:
    """End-to-end pipeline test for filesystem.write_file."""

    def test_write_file_success(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "filesystem.write_file",
            "config": {"path": "output.txt", "content": "written content"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is True
        assert (ws / "output.txt").read_text() == "written content"


class TestDispatcherListDir:
    """End-to-end pipeline test for filesystem.list_dir."""

    def test_list_dir_success(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        (ws / "a.txt").write_text("a")
        (ws / "b.txt").write_text("b")
        action = {
            "tool_name": "filesystem.list_dir",
            "config": {"path": "."},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is True
        assert "a.txt" in result.output_data["entries"]


class TestDispatcherReport:
    """End-to-end pipeline test for report.render_markdown."""

    def test_render_markdown_success(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "report.render_markdown",
            "config": {
                "content": "## Hello\nThis is a report.",
                "output_path": "report.md",
                "title": "Test Report",
            },
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is True
        written = (ws / "report.md").read_text()
        assert "# Test Report" in written


class TestDispatcherTts:
    """End-to-end pipeline test for tts.generate."""

    def test_tts_stub_result(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "tts.generate",
            "config": {
                "text": "Hello",
                "voice_profile": "default",
                "output_path": "out.mp3",
            },
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is True
        assert result.output_data["implemented"] is False


class TestDispatcherValidationFailure:
    """Pipeline short-circuit on validation failure."""

    def test_missing_required_param_fails(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {},  # Missing 'path'
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False
        # Should have normalize + validate stages but not execute
        stage_names = [s.stage_name for s in result.stage_results]
        assert "schema_validation" in stage_names
        assert "execute" not in stage_names


class TestDispatcherPolicyDenial:
    """Pipeline short-circuit on policy denial."""

    def test_external_action_denied_no_hosts(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path, allowed_hosts=[])
        action = {
            "tool_name": "http.fetch_whitelisted",
            "config": {"url": "https://example.com"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False
        stage_names = [s.stage_name for s in result.stage_results]
        assert "policy" in stage_names


class TestDispatcherScopeViolation:
    """Pipeline short-circuit on scope violation."""

    def test_path_traversal_blocked(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "../../etc/passwd"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False
        scope_stage = [s for s in result.stage_results if s.stage_name == "scope"]
        assert len(scope_stage) == 1
        assert scope_stage[0].verdict == StageVerdict.FAILED


class TestDispatcherDryRun:
    """Pipeline dry run mode."""

    def test_dry_run_skips_execution(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "filesystem.write_file",
            "config": {"path": "output.txt", "content": "should not write"},
            "dry_run": True,
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is True
        assert result.output_data.get("dry_run") is True
        # File should NOT be created
        assert not (ws / "output.txt").exists()


class TestDispatcherLedgerIntegration:
    """Verify ledger entries are created for all outcomes."""

    def test_successful_command_has_ledger(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        (ws / "f.txt").write_text("content")
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "f.txt"},
        }
        disp.execute("run-test", "swarm-test", action, ws, {})
        ledger_path = Path(disp.config.ledger_root) / "openshell_ledger.jsonl"
        assert ledger_path.exists()
        lines = [l for l in ledger_path.read_text().strip().split("\n") if l.strip()]
        assert len(lines) >= 1

    def test_denied_command_has_ledger(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {},  # Will fail validation
        }
        disp.execute("run-test", "swarm-test", action, ws, {})
        ledger_path = Path(disp.config.ledger_root) / "openshell_ledger.jsonl"
        assert ledger_path.exists()


class TestDispatcherArtifacts:
    """Verify artifacts are emitted."""

    def test_artifacts_produced(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        (ws / "test.txt").write_text("hello")
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "test.txt"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert len(result.artifacts_produced) > 0
        for p in result.artifacts_produced:
            assert Path(p).exists()


class TestDispatcherToToolResult:
    """Tests for to_tool_result static method."""

    def test_converts_success(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        (ws / "test.txt").write_text("hello")
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "test.txt"},
        }
        cmd_result = disp.execute("run-test", "swarm-test", action, ws, {})
        tool_result = OpenShellDispatcher.to_tool_result(cmd_result)
        assert isinstance(tool_result, ToolResult)
        assert tool_result.success is True
        assert tool_result.metadata["openshell"] is True
        assert tool_result.output_data["content"] == "hello"

    def test_converts_failure(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {},
        }
        cmd_result = disp.execute("run-test", "swarm-test", action, ws, {})
        tool_result = OpenShellDispatcher.to_tool_result(cmd_result)
        assert tool_result.success is False
        assert tool_result.error is not None


class TestDispatcherUnregisteredCommand:
    """Test behavior when normalizer returns None (should not normally happen if handles() is checked)."""

    def test_unregistered_command_returns_failure(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        action = {
            "tool_name": "nonexistent.command",
            "config": {},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False
        assert "not in registry" in result.error.lower() or "not in registry" in result.error


class TestDispatcherExecutionError:
    """Test behavior when adapter raises ExecutionError."""

    def test_execution_error_captured(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        # Try to read a file that doesn't exist
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "nonexistent.txt"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False


class TestDispatcherNoAdapter:
    """Test behavior when no adapter is registered for the command namespace."""

    def test_no_adapter_for_namespace_returns_failure(self, tmp_path):
        # Copy all existing command spec JSONs into a temp dir
        real_specs = Path(__file__).resolve().parent.parent.parent / "swarm" / "openshell" / "command_specs"
        tmp_specs = tmp_path / "specs"
        shutil.copytree(real_specs, tmp_specs)

        # Add a bogus spec with an unregistered namespace
        bogus_spec = {
            "command_name": "bogus.do_thing",
            "version": "v1",
            "description": "A command with no adapter.",
            "side_effect_level": "read_only",
            "supports_dry_run": False,
            "reversible": False,
            "parameters_schema": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            "scope_requirements": {"filesystem": False, "network": False},
            "constraints": {},
            "timeout_seconds": 10,
        }
        (tmp_specs / "bogus.do_thing.v1.json").write_text(json.dumps(bogus_spec))

        cfg = OpenShellConfig.for_run(tmp_path, "run-test")
        cfg.command_specs_dir = str(tmp_specs)
        ws = tmp_path / "workspace" / "run-test"
        ws.mkdir(parents=True)
        disp = OpenShellDispatcher(cfg)

        action = {"tool_name": "bogus.do_thing", "config": {}}
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False
        assert "No adapter" in result.error


class TestDispatcherExecutionErrorCaught:
    """Test that ExecutionError from an adapter is caught and surfaced."""

    def test_write_file_overwrite_false_raises_execution_error(self, tmp_path):
        disp, ws = _make_dispatcher(tmp_path)
        # Create existing file so overwrite=false triggers ExecutionError
        (ws / "existing.txt").write_text("original")

        action = {
            "tool_name": "filesystem.write_file",
            "config": {"path": "existing.txt", "content": "new"},
        }
        result = disp.execute("run-test", "swarm-test", action, ws, {})
        assert result.success is False
        # Find the execute stage and verify it failed
        execute_stages = [s for s in result.stage_results if s.stage_name == "execute"]
        assert len(execute_stages) == 1
        assert execute_stages[0].verdict == StageVerdict.FAILED
