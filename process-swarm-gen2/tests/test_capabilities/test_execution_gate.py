"""Tests for ExecutionGate trust chain verification."""

from __future__ import annotations

import copy

import pytest

from runtime.compiler.compiler import compile_plan
from runtime.gate.execution_gate import ExecutionGate, GateDecision
from runtime.identity.signer import sign_and_attach
from runtime.lease.lease_manager import build_capabilities_from_plan, issue_lease
from runtime.validation.validator import validate_proposal


@pytest.fixture
def full_chain(sample_proposal, keys_dir, schemas_dir):
    """Build a complete valid trust chain: proposal -> validation -> plan -> lease."""
    validation = validate_proposal(sample_proposal, keys_dir, schemas_dir)
    plan = compile_plan(sample_proposal, validation, keys_dir, schemas_dir)
    granted, denied, scope = build_capabilities_from_plan(plan)
    lease = issue_lease(plan, granted, denied, scope, 3600, "m4-exec-001", keys_dir)
    return {
        "proposal": sample_proposal,
        "validation": validation,
        "plan": plan,
        "lease": lease,
    }


class TestExecutionGate:
    def test_valid_chain_passes(self, full_chain, keys_dir):
        gate = ExecutionGate()
        decision = gate.check(
            full_chain["plan"],
            full_chain["validation"],
            full_chain["lease"],
            keys_dir,
        )
        assert decision.allowed
        assert "All checks passed" in decision.reasons

    def test_unsigned_plan_fails(self, full_chain, keys_dir):
        gate = ExecutionGate()
        plan = copy.deepcopy(full_chain["plan"])
        del plan["signature"]
        decision = gate.check(plan, full_chain["validation"], full_chain["lease"], keys_dir)
        assert not decision.allowed
        assert any("unsigned" in r.lower() for r in decision.reasons)

    def test_tampered_plan_fails(self, full_chain, keys_dir):
        gate = ExecutionGate()
        plan = copy.deepcopy(full_chain["plan"])
        plan["steps"] = []  # Tamper
        decision = gate.check(plan, full_chain["validation"], full_chain["lease"], keys_dir)
        assert not decision.allowed

    def test_proposal_id_mismatch_fails(self, full_chain, keys_dir):
        gate = ExecutionGate()
        validation = copy.deepcopy(full_chain["validation"])
        validation["proposal_id"] = "wrong-id"
        validation.pop("signature", None)
        decision = gate.check(full_chain["plan"], validation, full_chain["lease"], keys_dir)
        assert not decision.allowed
        assert any("mismatch" in r.lower() for r in decision.reasons)

    def test_revoked_lease_fails(self, full_chain, keys_dir):
        gate = ExecutionGate()
        lease = copy.deepcopy(full_chain["lease"])
        lease["revocation_status"] = "revoked"
        decision = gate.check(full_chain["plan"], full_chain["validation"], lease, keys_dir)
        assert not decision.allowed

    def test_wrong_plan_binding_fails(self, full_chain, keys_dir):
        gate = ExecutionGate()
        lease = copy.deepcopy(full_chain["lease"])
        lease["execution_plan_id"] = "wrong-plan-id"
        decision = gate.check(full_chain["plan"], full_chain["validation"], lease, keys_dir)
        assert not decision.allowed

    def test_failed_validation_fails(self, full_chain, keys_dir):
        gate = ExecutionGate()
        validation = copy.deepcopy(full_chain["validation"])
        validation["status"] = "failed"
        validation.pop("signature", None)
        decision = gate.check(full_chain["plan"], validation, full_chain["lease"], keys_dir)
        assert not decision.allowed

    def test_returns_gate_decision(self, full_chain, keys_dir):
        gate = ExecutionGate()
        decision = gate.check(
            full_chain["plan"],
            full_chain["validation"],
            full_chain["lease"],
            keys_dir,
        )
        assert isinstance(decision, GateDecision)
