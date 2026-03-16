from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

import pytest

from runtime.gate.execution_gate import ExecutionGate
from runtime.identity.key_manager import generate_keypair, save_keypair
from runtime.identity.signer import (
    sign_and_attach,
    sign_artifact,
    verify_attached_signature,
    verify_signature,
)
from runtime.lease.lease_manager import check_lease_validity
from tests.redteam.conftest import build_artifact_chain


class TestRevokedLeaseRejection:
    """ARGUS-9 RT-10: Revoked leases must be rejected."""

    def test_revoked_lease_fails_validity(self):
        now = datetime.now(timezone.utc)
        lease = {
            "lease_id": "lease-revoked",
            "execution_plan_id": "plan-001",
            "valid_from": now.isoformat(),
            "expires_at": (now + timedelta(hours=1)).isoformat(),
            "revocation_status": "revoked",
        }
        valid, reason = check_lease_validity(lease)
        assert not valid

    def test_revoked_lease_blocks_gate(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        lease = copy.deepcopy(lease)
        lease.pop("signature", None)
        lease["revocation_status"] = "revoked"
        lease = sign_and_attach(lease, "lease_issuer_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("revoked" in r.lower() for r in decision.reasons)


class TestCompromisedSignerDetection:
    """ARGUS-9 RT-10: Compromised or rotated keys must invalidate signatures."""

    def test_key_swap_detected(self, tmp_path):
        keys = tmp_path / "keys"
        keys.mkdir()
        role = "compiler_signer"
        sk1, _ = generate_keypair()
        save_keypair(role, sk1, keys)
        artifact = {"type": "test", "data": "original"}
        sig = sign_artifact(artifact, role, keys)
        sk2, _ = generate_keypair()
        save_keypair(role, sk2, keys)
        assert not verify_signature(artifact, sig, role, keys)

    def test_cross_role_signature_rejected(self, keys_dir):
        artifact = {"type": "test", "data": "cross-role"}
        sig = sign_artifact(artifact, "compiler_signer", keys_dir)
        assert not verify_signature(artifact, sig, "validator_signer", keys_dir)

    def test_rotated_key_fails_gate(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        sk_new, _ = generate_keypair()
        save_keypair("compiler_signer", sk_new, keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed


class TestLeaseStatusTransitions:
    """ARGUS-9 RT-10: Only 'active' status is accepted."""

    @pytest.mark.parametrize(
        "bad_status",
        ["revoked", "expired", "suspended", "pending", "", "ACTIVE"],
    )
    def test_bad_status_rejected(self, bad_status):
        now = datetime.now(timezone.utc)
        lease = {
            "lease_id": "lease-status-test",
            "execution_plan_id": "plan-001",
            "valid_from": now.isoformat(),
            "expires_at": (now + timedelta(hours=1)).isoformat(),
            "revocation_status": bad_status,
        }
        valid, reason = check_lease_validity(lease)
        assert not valid

    def test_active_passes(self):
        now = datetime.now(timezone.utc)
        lease = {
            "lease_id": "lease-status-test",
            "execution_plan_id": "plan-001",
            "valid_from": now.isoformat(),
            "expires_at": (now + timedelta(hours=1)).isoformat(),
            "revocation_status": "active",
        }
        valid, reason = check_lease_validity(lease)
        assert valid
