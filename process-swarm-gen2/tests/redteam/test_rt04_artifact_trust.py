from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

import pytest

from runtime.gate.execution_gate import GateDecision
from runtime.identity.signer import (
    sign_and_attach,
    sign_artifact,
    verify_attached_signature,
    verify_signature,
)
from tests.redteam.conftest import build_artifact_chain


class TestSignatureVerification:
    """ARGUS-9 RT-04: Signature verification invariants."""

    def test_valid_signature_passes(self, keys_dir):
        artifact = {"type": "test", "value": 42}
        sig = sign_artifact(artifact, "compiler_signer", keys_dir)
        assert verify_signature(artifact, sig, "compiler_signer", keys_dir)

    def test_forged_signature_rejected(self, keys_dir):
        import base64

        artifact = {"type": "test", "value": 42}
        forged_sig = base64.b64encode(b"\x00" * 64).decode("ascii")
        assert not verify_signature(artifact, forged_sig, "compiler_signer", keys_dir)

    def test_tampered_content_rejected(self, keys_dir):
        artifact = {"type": "test", "value": 42}
        sig = sign_artifact(artifact, "compiler_signer", keys_dir)
        tampered = copy.deepcopy(artifact)
        tampered["value"] = 999
        assert not verify_signature(tampered, sig, "compiler_signer", keys_dir)

    def test_wrong_role_key_rejected(self, keys_dir):
        artifact = {"type": "test", "value": 42}
        sig = sign_artifact(artifact, "compiler_signer", keys_dir)
        assert not verify_signature(artifact, sig, "validator_signer", keys_dir)

    def test_missing_key_raises_error(self, tmp_path):
        artifact = {"type": "test", "value": 42}
        empty_keys = tmp_path / "empty_keys"
        empty_keys.mkdir()
        with pytest.raises(FileNotFoundError):
            verify_signature(artifact, "dummysig==", "nonexistent_role", empty_keys)

    def test_attached_signature_roundtrip(self, keys_dir):
        artifact = {"type": "test", "value": 42}
        signed = sign_and_attach(artifact, "compiler_signer", keys_dir)
        assert verify_attached_signature(signed, keys_dir)

    def test_attached_tampered_rejected(self, keys_dir):
        artifact = {"type": "test", "value": 42}
        signed = sign_and_attach(artifact, "compiler_signer", keys_dir)
        signed["value"] = 999
        assert not verify_attached_signature(signed, keys_dir)

    def test_missing_signature_block_rejected(self, keys_dir):
        artifact = {"type": "test", "value": 42}
        assert "signature" not in artifact
        assert not verify_attached_signature(artifact, keys_dir)

    def test_empty_signature_block_rejected(self, keys_dir):
        artifact = {"type": "test", "value": 42, "signature": {}}
        assert not verify_attached_signature(artifact, keys_dir)


class TestExecutionGate:
    """ARGUS-9 RT-04: Execution gate trust chain invariants."""

    def test_valid_chain_passes(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert decision.allowed is True

    def test_unsigned_plan_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        plan = copy.deepcopy(plan)
        del plan["signature"]
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("signature" in r.lower() or "unsigned" in r.lower() for r in decision.reasons)

    def test_unsigned_validation_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        validation = copy.deepcopy(validation)
        del validation["signature"]
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed

    def test_unsigned_lease_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        lease = copy.deepcopy(lease)
        del lease["signature"]
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed

    def test_tampered_plan_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        plan = copy.deepcopy(plan)
        plan["extra_field"] = "injected"
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed

    def test_proposal_id_mismatch_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        validation = copy.deepcopy(validation)
        validation.pop("signature", None)
        validation["proposal_id"] = "wrong-proposal"
        validation = sign_and_attach(validation, "validator_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("mismatch" in r.lower() for r in decision.reasons)

    def test_lease_plan_binding_mismatch(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        lease = copy.deepcopy(lease)
        lease.pop("signature", None)
        lease["execution_plan_id"] = "wrong-plan-id"
        lease = sign_and_attach(lease, "lease_issuer_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed

    def test_expired_lease_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        lease = copy.deepcopy(lease)
        lease.pop("signature", None)
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        lease["expires_at"] = past.isoformat()
        lease = sign_and_attach(lease, "lease_issuer_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("expir" in r.lower() for r in decision.reasons)

    def test_failed_validation_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        validation = copy.deepcopy(validation)
        validation.pop("signature", None)
        validation["status"] = "failed"
        validation = sign_and_attach(validation, "validator_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("validation" in r.lower() for r in decision.reasons)

    def test_all_unsigned_fully_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(
            keys_dir, signed=False
        )
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        signature_reasons = [
            r for r in decision.reasons if "sign" in r.lower() or "unsigned" in r.lower()
        ]
        assert len(signature_reasons) >= 3
