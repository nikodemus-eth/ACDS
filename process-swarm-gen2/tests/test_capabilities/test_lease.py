"""Tests for capability lease management."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from runtime.identity.signer import verify_attached_signature
from runtime.lease.lease_manager import (
    build_capabilities_from_plan,
    check_lease_validity,
    issue_lease,
    list_leases,
    load_lease,
    revoke_lease,
    save_lease,
)


@pytest.fixture
def sample_plan():
    return {
        "plan_id": "plan-001",
        "required_capabilities": ["FILESYSTEM_WRITE", "TEST_EXECUTION"],
        "scope_constraints": {"allowed_paths": ["output/"]},
        "steps": [{"step_id": "s1"}, {"step_id": "s2"}],
    }


@pytest.fixture
def sample_lease(sample_plan, keys_dir):
    granted, denied, scope = build_capabilities_from_plan(sample_plan)
    return issue_lease(
        sample_plan, granted, denied, scope, 3600, "m4-exec-001", keys_dir
    )


class TestIssueLease:
    def test_creates_lease(self, sample_plan, keys_dir):
        granted, denied, scope = build_capabilities_from_plan(sample_plan)
        lease = issue_lease(
            sample_plan, granted, denied, scope, 3600, "m4-exec-001", keys_dir
        )
        assert "lease_id" in lease
        assert lease["execution_plan_id"] == "plan-001"
        assert lease["revocation_status"] == "active"

    def test_lease_is_signed(self, sample_lease, keys_dir):
        assert sample_lease["signature"]["signer_role"] == "lease_issuer_signer"
        assert verify_attached_signature(sample_lease, keys_dir)

    def test_stores_when_dir_provided(self, sample_plan, keys_dir, tmp_path):
        leases_dir = tmp_path / "leases"
        granted, denied, scope = build_capabilities_from_plan(sample_plan)
        lease = issue_lease(
            sample_plan, granted, denied, scope, 3600, "m4-exec-001",
            keys_dir, leases_dir
        )
        active_files = list((leases_dir / "active").glob("*.json"))
        assert len(active_files) == 1


class TestCheckLeaseValidity:
    def test_active_lease_valid(self, sample_lease):
        valid, reason = check_lease_validity(sample_lease)
        assert valid
        assert "valid" in reason.lower()

    def test_revoked_lease_invalid(self, sample_lease):
        sample_lease["revocation_status"] = "revoked"
        valid, reason = check_lease_validity(sample_lease)
        assert not valid
        assert "revoked" in reason.lower()

    def test_expired_lease_invalid(self, sample_lease):
        sample_lease["expires_at"] = "2020-01-01T00:00:00+00:00"
        valid, reason = check_lease_validity(sample_lease)
        assert not valid
        assert "expired" in reason.lower()


class TestRevokeLease:
    def test_revoke_moves_file(self, sample_plan, keys_dir, tmp_path):
        leases_dir = tmp_path / "leases"
        granted, denied, scope = build_capabilities_from_plan(sample_plan)
        lease = issue_lease(
            sample_plan, granted, denied, scope, 3600, "m4-exec-001",
            keys_dir, leases_dir
        )
        event = revoke_lease(lease["lease_id"], "test", leases_dir, keys_dir)
        assert event["lease_id"] == lease["lease_id"]
        assert len(list((leases_dir / "active").glob("*.json"))) == 0
        assert len(list((leases_dir / "revoked").glob("*.json"))) >= 1

    def test_revoke_missing_raises(self, keys_dir, tmp_path):
        leases_dir = tmp_path / "leases"
        (leases_dir / "active").mkdir(parents=True)
        with pytest.raises(FileNotFoundError):
            revoke_lease("nonexistent", "test", leases_dir, keys_dir)


class TestBuildCapabilities:
    def test_filesystem_write(self):
        plan = {
            "required_capabilities": ["FILESYSTEM_WRITE"],
            "scope_constraints": {"allowed_paths": ["output/"]},
            "steps": [],
        }
        granted, denied, scope = build_capabilities_from_plan(plan)
        assert "filesystem" in granted
        assert granted["filesystem"]["write"]
        assert "network_access" in denied

    def test_test_execution(self):
        plan = {
            "required_capabilities": ["TEST_EXECUTION"],
            "scope_constraints": {},
            "steps": [],
        }
        granted, _, _ = build_capabilities_from_plan(plan)
        assert "test_execution" in granted


class TestListLeases:
    def test_list_active(self, sample_plan, keys_dir, tmp_path):
        leases_dir = tmp_path / "leases"
        granted, denied, scope = build_capabilities_from_plan(sample_plan)
        issue_lease(
            sample_plan, granted, denied, scope, 3600, "m4-exec-001",
            keys_dir, leases_dir
        )
        result = list_leases(leases_dir, "active")
        assert len(result) == 1
