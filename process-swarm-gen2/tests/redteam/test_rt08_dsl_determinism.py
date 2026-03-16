from __future__ import annotations

import json

import pytest

from swarm.compiler.compiler import BehaviorSequenceCompiler
from swarm.definer.constraints import (
    ConstraintSet,
    constraint_set_to_dict,
    extract_constraints,
    validate_constraints,
)
from swarm.definer.pipeline import validate_dependencies
from swarm.definer.templates import (
    get_base_actions,
    get_default_dependencies,
    get_template,
    list_archetypes,
)


@pytest.fixture
def workspace_root(tmp_path):
    return tmp_path / "workspace"


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


# ──────────────────────────────────────────────
# RT08-A: Compiler Determinism
# ──────────────────────────────────────────────


class TestCompilerDeterminism:
    def _seq(self):
        return _make_behavior_sequence(
            [
                {"op": "create", "path": "output/report.md", "content": "# Report"},
                {"op": "append", "path": "output/report.md", "content": "Body text"},
            ],
            target_paths=["output/"],
        )

    def test_identical_modifications(self, workspace_root):
        compiler = BehaviorSequenceCompiler(workspace_root=workspace_root)
        p1 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        p2 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        assert p1["modifications"] == p2["modifications"]

    def test_identical_scope(self, workspace_root):
        compiler = BehaviorSequenceCompiler(workspace_root=workspace_root)
        p1 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        p2 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        assert p1["scope_boundary"] == p2["scope_boundary"]

    def test_identical_acceptance_tests(self, workspace_root):
        compiler = BehaviorSequenceCompiler(workspace_root=workspace_root)
        p1 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        p2 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        assert p1["acceptance_tests"] == p2["acceptance_tests"]

    def test_proposal_id_varies_structure_stable(self, workspace_root):
        compiler = BehaviorSequenceCompiler(workspace_root=workspace_root)
        p1 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        p2 = compiler.compile("swarm-det", self._seq(), {"run_id": "r1"})
        # proposal_id contains a random uuid component, so they differ
        assert p1["proposal_id"] != p2["proposal_id"]
        # but all structural fields are identical
        assert p1["modifications"] == p2["modifications"]
        assert p1["scope_boundary"] == p2["scope_boundary"]
        assert p1["acceptance_tests"] == p2["acceptance_tests"]
        assert p1["target_paths"] == p2["target_paths"]


# ──────────────────────────────────────────────
# RT08-B: Template Determinism
# ──────────────────────────────────────────────


class TestTemplateDeterminism:
    def test_all_archetypes_load_consistently(self):
        for name in list_archetypes():
            t1 = get_template(name)
            t2 = get_template(name)
            assert t1.version == t2.version
            assert t1.description == t2.description
            assert len(t1.base_actions) == len(t2.base_actions)

    def test_all_templates_valid_action_types(self):
        for name in list_archetypes():
            actions = get_base_actions(name)
            for action in actions:
                assert isinstance(action.action_type, str)
                assert len(action.action_type) > 0

    def test_all_default_dependencies_acyclic(self):
        for name in list_archetypes():
            deps = get_default_dependencies(name)
            actions = get_base_actions(name)
            # Build action dicts for validate_dependencies
            action_dicts = [
                {"action_id": f"act-{i}", "action_name": a.name}
                for i, a in enumerate(actions)
            ]
            dep_tuples = [
                (f"act-{d[0]}", f"act-{d[1]}") for d in deps
            ]
            errors = validate_dependencies(action_dicts, dep_tuples)
            assert errors == [], f"Archetype '{name}' has cycle: {errors}"

    def test_all_dependency_indices_valid(self):
        for name in list_archetypes():
            deps = get_default_dependencies(name)
            action_count = len(get_base_actions(name))
            for from_idx, to_idx in deps:
                assert 0 <= from_idx < action_count, (
                    f"Archetype '{name}': from_idx {from_idx} out of bounds"
                )
                assert 0 <= to_idx < action_count, (
                    f"Archetype '{name}': to_idx {to_idx} out of bounds"
                )


# ──────────────────────────────────────────────
# RT08-C: Constraint Determinism
# ──────────────────────────────────────────────


class TestConstraintDeterminism:
    def test_rule_based_extraction_deterministic(self):
        cs1 = extract_constraints(
            "Generate a daily briefing with 6 sources", "daily_briefing"
        )
        cs2 = extract_constraints(
            "Generate a daily briefing with 6 sources", "daily_briefing"
        )
        assert constraint_set_to_dict(cs1) == constraint_set_to_dict(cs2)

    def test_constraint_validation_deterministic(self):
        cs = ConstraintSet(min_word_count=1000, max_word_count=500)
        warnings1 = validate_constraints(cs)
        warnings2 = validate_constraints(cs)
        assert warnings1 == warnings2
        assert len(warnings1) > 0, "Expected at least one warning for conflicting constraints"
