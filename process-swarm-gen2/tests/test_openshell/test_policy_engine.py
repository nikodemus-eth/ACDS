"""Tests for swarm.openshell.policy_engine — PolicyEngine (Stage 3)."""

from __future__ import annotations

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)
from swarm.openshell.policy_engine import PolicyEngine


def _make_envelope(level: SideEffectLevel, command_name: str = "test.cmd") -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters={},
        side_effect_level=level,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


def _make_config(tmp_path, max_priv=4, allowed_hosts=None):
    cfg = OpenShellConfig.for_run(tmp_path, "run-test")
    cfg.max_privilege_level = max_priv
    if allowed_hosts is not None:
        cfg.allowed_hosts = allowed_hosts
    return cfg


class TestPolicyEngineAllow:
    """Tests for commands that should be allowed."""

    def test_read_only_allowed(self, tmp_path):
        cfg = _make_config(tmp_path)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.READ_ONLY)
        decision = engine.evaluate(env, {})
        assert decision.allowed is True
        assert decision.decision == "allow"
        assert decision.matched_rule == "default_allow"

    def test_controlled_generation_allowed(self, tmp_path):
        cfg = _make_config(tmp_path)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.CONTROLLED_GENERATION)
        decision = engine.evaluate(env, {})
        assert decision.allowed is True

    def test_local_mutation_allowed(self, tmp_path):
        cfg = _make_config(tmp_path)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.LOCAL_MUTATION)
        decision = engine.evaluate(env, {})
        assert decision.allowed is True

    def test_external_action_allowed_when_hosts_configured(self, tmp_path):
        cfg = _make_config(tmp_path, allowed_hosts=["example.com"])
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.EXTERNAL_ACTION)
        decision = engine.evaluate(env, {})
        assert decision.allowed is True

    def test_constraints_from_spec_forwarded(self, tmp_path):
        cfg = _make_config(tmp_path)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.READ_ONLY)
        spec = {"constraints": {"max_bytes": 1024}}
        decision = engine.evaluate(env, spec)
        assert decision.constraints == {"max_bytes": 1024}


class TestPolicyEngineDeny:
    """Tests for commands that should be denied."""

    def test_privileged_always_denied(self, tmp_path):
        cfg = _make_config(tmp_path)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.PRIVILEGED)
        decision = engine.evaluate(env, {})
        assert decision.allowed is False
        assert decision.decision == "deny"
        assert decision.matched_rule == "privileged_deny"
        assert "PRIVILEGED" in decision.reason

    def test_exceeds_privilege_ceiling(self, tmp_path):
        # Set ceiling to 2 (CONTROLLED_GENERATION), then try LOCAL_MUTATION (3)
        cfg = _make_config(tmp_path, max_priv=2)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.LOCAL_MUTATION)
        decision = engine.evaluate(env, {})
        assert decision.allowed is False
        assert decision.matched_rule == "privilege_ceiling"

    def test_external_action_denied_no_hosts(self, tmp_path):
        cfg = _make_config(tmp_path, allowed_hosts=[])
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.EXTERNAL_ACTION)
        decision = engine.evaluate(env, {})
        assert decision.allowed is False
        assert decision.matched_rule == "external_no_hosts"

    def test_privileged_denied_even_with_high_ceiling(self, tmp_path):
        cfg = _make_config(tmp_path, max_priv=10)
        engine = PolicyEngine(cfg)
        env = _make_envelope(SideEffectLevel.PRIVILEGED)
        decision = engine.evaluate(env, {})
        assert decision.allowed is False
        assert decision.matched_rule == "privileged_deny"
