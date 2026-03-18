"""Tests for swarm.openshell.execution_planner — ExecutionPlanner (Stage 5)."""

from __future__ import annotations

from swarm.openshell.execution_planner import ExecutionPlanner
from swarm.openshell.models import (
    CommandEnvelope,
    ExecutionPlan,
    PolicyDecision,
    ScopeCheck,
    SideEffectLevel,
    new_id,
    now_utc,
)


def _make_envelope(command_name: str = "filesystem.read_file") -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters={"path": "test.txt"},
        side_effect_level=SideEffectLevel.READ_ONLY,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


class TestExecutionPlanner:
    """Tests for ExecutionPlanner.build()."""

    def test_returns_execution_plan(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope()
        plan = planner.build(env, allow_policy, good_scope, {})
        assert isinstance(plan, ExecutionPlan)

    def test_plan_id_has_prefix(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope()
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.plan_id.startswith("plan-")

    def test_adapter_name_from_namespace(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope("filesystem.read_file")
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.adapter_name == "filesystem"

    def test_adapter_name_http(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope("http.fetch_whitelisted")
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.adapter_name == "http"

    def test_adapter_name_report(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope("report.render_markdown")
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.adapter_name == "report"

    def test_timeout_from_spec(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope()
        spec = {"timeout_seconds": 60}
        plan = planner.build(env, allow_policy, good_scope, spec)
        assert plan.timeout_ms == 60_000

    def test_timeout_default_30s(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope()
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.timeout_ms == 30_000

    def test_expected_artifacts_populated(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope("filesystem.read_file")
        plan = planner.build(env, allow_policy, good_scope, {})
        assert "filesystem.read_file.result" in plan.expected_artifacts

    def test_envelope_preserved(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope()
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.envelope is env

    def test_policy_and_scope_preserved(self, allow_policy, good_scope):
        planner = ExecutionPlanner()
        env = _make_envelope()
        plan = planner.build(env, allow_policy, good_scope, {})
        assert plan.policy_decision is allow_policy
        assert plan.scope_check is good_scope
