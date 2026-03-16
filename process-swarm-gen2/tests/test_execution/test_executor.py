"""Tests for governed executor."""

from __future__ import annotations

from pathlib import Path

import pytest

from runtime.executor.executor import Executor
from runtime.gate.toolgate import ToolGate


@pytest.fixture
def workspace(tmp_path):
    ws = tmp_path / "workspace"
    ws.mkdir()
    return ws


@pytest.fixture
def bound_gate():
    gate = ToolGate()
    gate.bind_lease({
        "revocation_status": "active",
        "valid_from": "2020-01-01T00:00:00+00:00",
        "expires_at": "2099-12-31T23:59:59+00:00",
        "granted_capabilities": {
            "filesystem": {"allowed_paths": ["output/"], "write": True},
            "test_execution": {"allowed": True},
        },
        "denied_capabilities": {},
        "scope_constraints": {"allowed_paths": ["output/"]},
    })
    return gate


@pytest.fixture
def executor(bound_gate, workspace):
    return Executor(bound_gate, workspace)


class TestFileOperations:
    def test_create_file(self, executor, workspace):
        plan = {
            "steps": [{
                "step_id": "s1", "operation": "create",
                "path": "output/test.md", "content": "Hello",
                "required_capability": "FILESYSTEM_WRITE",
            }]
        }
        result = executor.execute(plan, {})
        assert result["execution_status"] == "completed"
        assert (workspace / "output" / "test.md").read_text() == "Hello"

    def test_modify_file(self, executor, workspace):
        (workspace / "output").mkdir()
        (workspace / "output" / "test.md").write_text("old")
        plan = {
            "steps": [{
                "step_id": "s1", "operation": "modify",
                "path": "output/test.md", "content": "new",
                "required_capability": "FILESYSTEM_WRITE",
            }]
        }
        result = executor.execute(plan, {})
        assert result["execution_status"] == "completed"
        assert (workspace / "output" / "test.md").read_text() == "new"

    def test_delete_file(self, executor, workspace):
        (workspace / "output").mkdir()
        f = workspace / "output" / "test.md"
        f.write_text("delete me")
        plan = {
            "steps": [{
                "step_id": "s1", "operation": "delete",
                "path": "output/test.md", "content": "",
                "required_capability": "FILESYSTEM_WRITE",
            }]
        }
        result = executor.execute(plan, {})
        assert result["execution_status"] == "completed"
        assert not f.exists()

    def test_append_file(self, executor, workspace):
        (workspace / "output").mkdir()
        (workspace / "output" / "test.md").write_text("first")
        plan = {
            "steps": [{
                "step_id": "s1", "operation": "append",
                "path": "output/test.md", "content": " second",
                "required_capability": "FILESYSTEM_WRITE",
            }]
        }
        result = executor.execute(plan, {})
        assert (workspace / "output" / "test.md").read_text() == "first second"


class TestRunTest:
    def test_passing_test(self, executor):
        plan = {
            "steps": [{
                "step_id": "t1", "operation": "run_test",
                "path": "test -d .", "content": "",
                "required_capability": "TEST_EXECUTION",
            }]
        }
        result = executor.execute(plan, {})
        assert result["acceptance_results"][0]["passed"]

    def test_failing_test(self, executor):
        plan = {
            "steps": [{
                "step_id": "t1", "operation": "run_test",
                "path": "test -f nonexistent_file_xyz",
                "content": "", "required_capability": "TEST_EXECUTION",
            }]
        }
        result = executor.execute(plan, {})
        assert not result["acceptance_results"][0]["passed"]


class TestHaltOnFailure:
    def test_halts_after_failed_step(self, executor, workspace):
        plan = {
            "steps": [
                {
                    "step_id": "s1", "operation": "modify",
                    "path": "output/nonexistent.md", "content": "x",
                    "required_capability": "FILESYSTEM_WRITE",
                },
                {
                    "step_id": "s2", "operation": "create",
                    "path": "output/should_not_exist.md", "content": "x",
                    "required_capability": "FILESYSTEM_WRITE",
                },
            ]
        }
        result = executor.execute(plan, {})
        assert result["execution_status"] in ("partial", "failed")
        assert result["actions"][1]["status"] == "skipped"


class TestToolGateDenial:
    def test_denied_operation_fails(self, workspace):
        gate = ToolGate()  # No lease bound
        executor = Executor(gate, workspace)
        plan = {
            "steps": [{
                "step_id": "s1", "operation": "create",
                "path": "output/test.md", "content": "x",
                "required_capability": "FILESYSTEM_WRITE",
            }]
        }
        result = executor.execute(plan, {})
        assert result["actions"][0]["status"] == "failed"
        assert "ToolGate" in result["actions"][0]["detail"]
