"""GRITS tests for policy enforcement.

Tests local-only, sensitivity, capability registration, and policy
result population. NO mocks, NO stubs, NO monkeypatches.
"""

from __future__ import annotations

from swarm.integration.contracts import (
    CapabilityRequest,
    ExecutionContext,
    RequestConstraints,
)
from swarm.integration.policy import (
    CAPABILITY_REGISTRY,
    ENCRYPTED_PROVIDERS,
    LOCAL_PROVIDERS,
    DefaultPolicy,
)


def _make_request(
    capability: str = "text.generate",
    local_only: bool = True,
    sensitivity: str = "medium",
) -> CapabilityRequest:
    return CapabilityRequest(
        capability=capability,
        input={"prompt": "test"},
        constraints=RequestConstraints(local_only=local_only, sensitivity=sensitivity),
        context=ExecutionContext(process_id="p", node_id="n", swarm_id="s"),
    )


class TestLocalOnlyEnforcement:
    """Local-only blocks non-local providers."""

    def test_local_provider_allowed(self):
        policy = DefaultPolicy()
        req = _make_request(local_only=True)
        result = policy.evaluate(req, "ollama")
        assert result.allowed is True

    def test_non_local_provider_blocked(self):
        policy = DefaultPolicy()
        req = _make_request(local_only=True)
        # A hypothetical external provider not in LOCAL_PROVIDERS
        # Since ollama and apple_intelligence are both local, test with unregistered
        result = policy.evaluate(req, "cloud_provider_xyz")
        assert result.allowed is False

    def test_registered_local_provider_is_allowed(self):
        policy = DefaultPolicy()
        req = _make_request(local_only=True)
        for provider in LOCAL_PROVIDERS:
            result = policy.evaluate(req, provider)
            assert result.allowed is True, f"{provider} should be allowed"


class TestSensitivityEnforcement:
    """High sensitivity blocks unencrypted providers."""

    def test_high_sensitivity_blocks_unencrypted(self):
        policy = DefaultPolicy()
        req = _make_request(sensitivity="high")
        # ollama is NOT in ENCRYPTED_PROVIDERS
        result = policy.evaluate(req, "ollama")
        assert result.allowed is False
        assert "encryption" in result.reason.lower()

    def test_high_sensitivity_allows_encrypted(self):
        policy = DefaultPolicy()
        req = _make_request(sensitivity="high")
        result = policy.evaluate(req, "apple_intelligence")
        assert result.allowed is True

    def test_medium_sensitivity_allows_all_local(self):
        policy = DefaultPolicy()
        req = _make_request(sensitivity="medium")
        result = policy.evaluate(req, "ollama")
        assert result.allowed is True


class TestCapabilityRegistration:
    """Unknown capability and empty capability rejected."""

    def test_unknown_capability_rejected(self):
        policy = DefaultPolicy()
        req = _make_request(capability="nonexistent.thing")
        result = policy.evaluate(req, "ollama")
        assert result.allowed is False
        assert "not registered" in result.reason.lower()

    def test_empty_capability_rejected(self):
        policy = DefaultPolicy()
        req = _make_request(capability="")
        result = policy.evaluate(req, "ollama")
        assert result.allowed is False


class TestPolicyChecks:
    """Policy checks list populated."""

    def test_checks_populated_on_success(self):
        policy = DefaultPolicy()
        req = _make_request()
        result = policy.evaluate(req, "ollama")
        assert len(result.checks_performed) >= 3
        assert "provider_registered" in result.checks_performed
        assert "capability_supported" in result.checks_performed
        assert "local_only" in result.checks_performed

    def test_checks_populated_on_failure(self):
        policy = DefaultPolicy()
        req = _make_request(sensitivity="high")
        result = policy.evaluate(req, "ollama")
        assert "sensitivity_encryption" in result.checks_performed
