from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

import pytest

from runtime.gate.execution_gate import GateDecision
from runtime.identity.signer import sign_and_attach
from tests.redteam.conftest import build_artifact_chain


class TestCentralInvariant:
    """ARGUS-9 central invariant: No signed plan, no execution."""

    def test_completely_unsigned_chain_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(
            keys_dir, signed=False
        )
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert len(decision.reasons) >= 3

    def test_gate_decision_structure(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert isinstance(decision, GateDecision)
        assert isinstance(decision.allowed, bool)
        assert isinstance(decision.reasons, list)

    def test_single_missing_signature_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=False)
        validation = sign_and_attach(validation, "validator_signer", keys_dir)
        lease = sign_and_attach(lease, "lease_issuer_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any(
            "plan" in r.lower() and ("unsigned" in r.lower() or "sign" in r.lower())
            for r in decision.reasons
        )

    def test_signed_broken_referential_integrity(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        validation = copy.deepcopy(validation)
        validation.pop("signature", None)
        validation["proposal_id"] = "wrong-proposal-id"
        validation = sign_and_attach(validation, "validator_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("mismatch" in r.lower() for r in decision.reasons)

    def test_gate_check_complete_not_shortcircuit(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(
            keys_dir, signed=False
        )
        validation = copy.deepcopy(validation)
        validation["proposal_id"] = "wrong-proposal-id"
        lease = copy.deepcopy(lease)
        lease["execution_plan_id"] = "wrong-plan-id"
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert len(decision.reasons) >= 3
