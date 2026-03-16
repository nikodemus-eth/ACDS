"""Tests for ToolGate default-deny capability mediator."""

from __future__ import annotations

import pytest

from runtime.gate.toolgate import Capability, CapabilityDecision, ToolGate


@pytest.fixture
def active_lease():
    """A valid active lease for testing."""
    return {
        "revocation_status": "active",
        "valid_from": "2020-01-01T00:00:00+00:00",
        "expires_at": "2099-12-31T23:59:59+00:00",
        "granted_capabilities": {
            "filesystem": {
                "allowed_paths": ["output/"],
                "write": True,
            },
            "test_execution": {"allowed": True},
        },
        "denied_capabilities": {},
        "scope_constraints": {
            "allowed_paths": ["output/"],
        },
    }


class TestDefaultDeny:
    def test_denies_without_lease(self):
        gate = ToolGate()
        assert not gate.authorize("FILESYSTEM_WRITE", "output/test.md")

    def test_denies_after_unbind(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        gate.unbind()
        assert not gate.authorize("FILESYSTEM_WRITE", "output/test.md")


class TestBindLease:
    def test_bind_active_lease(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert gate.authorize("FILESYSTEM_WRITE", "output/test.md")

    def test_reject_revoked_lease(self):
        lease = {"revocation_status": "revoked"}
        gate = ToolGate()
        with pytest.raises(ValueError, match="revoked"):
            gate.bind_lease(lease)

    def test_reject_expired_lease(self):
        lease = {
            "revocation_status": "active",
            "valid_from": "2020-01-01T00:00:00+00:00",
            "expires_at": "2020-01-02T00:00:00+00:00",
        }
        gate = ToolGate()
        with pytest.raises(ValueError, match="expired"):
            gate.bind_lease(lease)


class TestCapabilityAuthorization:
    def test_filesystem_write_granted(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert gate.authorize("FILESYSTEM_WRITE", "output/test.md")

    def test_filesystem_write_out_of_scope(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert not gate.authorize("FILESYSTEM_WRITE", "/etc/passwd")

    def test_test_execution_granted(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert gate.authorize("TEST_EXECUTION")

    def test_ungranted_capability_denied(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert not gate.authorize("ARTIFACT_GENERATION")

    def test_explicitly_denied(self, active_lease):
        active_lease["denied_capabilities"] = {"filesystem": True}
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert not gate.authorize("FILESYSTEM_WRITE", "output/test.md")

    def test_empty_target_path_denied_for_filesystem(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        assert not gate.authorize("FILESYSTEM_WRITE", "")


class TestRequestCapability:
    def test_returns_decision_object(self, active_lease):
        gate = ToolGate()
        gate.bind_lease(active_lease)
        decision = gate.request_capability("FILESYSTEM_WRITE", "output/test.md")
        assert isinstance(decision, CapabilityDecision)
        assert decision.allowed
        assert decision.reason == "Authorized by lease"

    def test_denied_decision_has_reason(self):
        gate = ToolGate()
        decision = gate.request_capability("FILESYSTEM_WRITE", "output/test.md")
        assert not decision.allowed
        assert "default deny" in decision.reason.lower()


class TestCapabilityEnum:
    def test_five_capabilities(self):
        assert len(Capability) == 5

    def test_string_values(self):
        assert Capability.FILESYSTEM_WRITE == "FILESYSTEM_WRITE"
        assert Capability.TEST_EXECUTION == "TEST_EXECUTION"
