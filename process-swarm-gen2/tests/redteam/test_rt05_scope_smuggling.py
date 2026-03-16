from __future__ import annotations

import json

import pytest

from swarm.compiler.compiler import BehaviorSequenceCompiler


@pytest.fixture
def workspace_root(tmp_path):
    return tmp_path / "workspace"


@pytest.fixture
def compiler(workspace_root):
    return BehaviorSequenceCompiler(workspace_root=workspace_root)


def _make_behavior_sequence(steps, target_paths=None, tests=None):
    if target_paths is None:
        target_paths = []
    if tests is None:
        tests = [
            {"test_id": "t1", "command": "echo ok", "expected_exit_code": 0},
        ]
    return {
        "ordered_steps_json": json.dumps(steps),
        "target_paths_json": json.dumps(target_paths),
        "acceptance_tests_json": json.dumps(tests),
    }


def _context():
    return {"run_id": "run-001"}


# ──────────────────────────────────────────────
# RT05-A: Path Traversal
# ──────────────────────────────────────────────


class TestPathTraversal:
    def test_single_dot_dot_blocked(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "../secret.txt", "content": "x"}],
        )
        with pytest.raises(ValueError, match="traversal"):
            compiler.compile("swarm-001", seq, _context())

    def test_nested_traversal_blocked(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "output/../../etc/passwd", "content": "x"}],
        )
        with pytest.raises(ValueError, match="traversal"):
            compiler.compile("swarm-001", seq, _context())

    def test_deeply_nested_traversal(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "output/a/b/c/../../../../etc/shadow", "content": "x"}],
        )
        with pytest.raises(ValueError, match="traversal"):
            compiler.compile("swarm-001", seq, _context())

    def test_traversal_in_middle(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "modify", "path": "output/safe/../../../etc/hosts", "content": "x"}],
        )
        with pytest.raises(ValueError, match="traversal"):
            compiler.compile("swarm-001", seq, _context())


# ──────────────────────────────────────────────
# RT05-B: Absolute Paths
# ──────────────────────────────────────────────


class TestAbsolutePaths:
    def test_absolute_unix_path(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "/etc/passwd", "content": "x"}],
        )
        with pytest.raises(ValueError, match="absolute"):
            compiler.compile("swarm-001", seq, _context())

    def test_absolute_root_path(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "/tmp/evil.sh", "content": "x"}],
        )
        with pytest.raises(ValueError, match="absolute"):
            compiler.compile("swarm-001", seq, _context())


# ──────────────────────────────────────────────
# RT05-C: Scope Containment
# ──────────────────────────────────────────────


class TestScopeContainment:
    def test_out_of_scope_rejected(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "src/main.py", "content": "x"}],
            target_paths=["output/"],
        )
        with pytest.raises(ValueError, match="not under"):
            compiler.compile("swarm-001", seq, _context())

    def test_similar_prefix_no_bypass(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "output_evil/hack.txt", "content": "x"}],
            target_paths=["output/"],
        )
        with pytest.raises(ValueError, match="not under"):
            compiler.compile("swarm-001", seq, _context())

    def test_valid_in_scope_passes(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "output/result.md", "content": "# Result"}],
            target_paths=["output/"],
        )
        proposal = compiler.compile("swarm-001", seq, _context())
        assert len(proposal["modifications"]) > 0

    def test_multiple_targets_enforced(self, compiler):
        steps = [
            {"op": "create", "path": "output/report.md", "content": "x"},
            {"op": "create", "path": "logs/debug.log", "content": "x"},
            {"op": "create", "path": "assets/file.png", "content": "x"},
        ]
        seq = _make_behavior_sequence(steps, target_paths=["output/", "logs/"])
        with pytest.raises(ValueError, match="not under"):
            compiler.compile("swarm-001", seq, _context())

    def test_empty_targets_allows_relative(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "create", "path": "anywhere/safe.txt", "content": "x"}],
            target_paths=[],
        )
        proposal = compiler.compile("swarm-001", seq, _context())
        assert len(proposal["modifications"]) > 0


# ──────────────────────────────────────────────
# RT05-D: Mixed Attacks
# ──────────────────────────────────────────────


class TestMixedAttacks:
    def test_valid_and_invalid_in_same_batch(self, compiler):
        steps = [
            {"op": "create", "path": "output/ok.txt", "content": "fine"},
            {"op": "create", "path": "../secret.txt", "content": "bad"},
        ]
        seq = _make_behavior_sequence(steps, target_paths=["output/"])
        with pytest.raises(ValueError):
            compiler.compile("swarm-001", seq, _context())

    def test_delete_outside_scope(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "delete", "path": "src/critical.py", "content": ""}],
            target_paths=["output/"],
        )
        with pytest.raises(ValueError):
            compiler.compile("swarm-001", seq, _context())

    def test_append_outside_scope(self, compiler):
        seq = _make_behavior_sequence(
            [{"op": "append", "path": "src/config.py", "content": "evil"}],
            target_paths=["output/"],
        )
        with pytest.raises(ValueError):
            compiler.compile("swarm-001", seq, _context())
