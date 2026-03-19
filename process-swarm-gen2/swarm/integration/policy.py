"""Default integration policy for ACDS capability requests.

Evaluates provider eligibility based on constraints, sensitivity,
and capability registration.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from swarm.integration.contracts import CapabilityRequest


# ---------------------------------------------------------------------------
# Provider metadata used by policy checks
# ---------------------------------------------------------------------------

# Providers known to run entirely on-device
LOCAL_PROVIDERS = {"ollama", "apple_intelligence"}

# Providers that support encrypted payloads
ENCRYPTED_PROVIDERS = {"apple_intelligence"}

# Capability -> list of provider IDs that can serve it
CAPABILITY_REGISTRY: dict[str, list[str]] = {
    "text.generate": ["ollama", "apple_intelligence"],
    "text.summarize": ["ollama", "apple_intelligence"],
    "text.classify": ["ollama", "apple_intelligence"],
    "speech.transcribe": ["apple_intelligence"],
    "policy.evaluate": ["ollama", "apple_intelligence"],
}


# ---------------------------------------------------------------------------
# Policy result
# ---------------------------------------------------------------------------

@dataclass
class PolicyResult:
    """Outcome of a policy evaluation."""

    allowed: bool
    reason: str
    checks_performed: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Default policy
# ---------------------------------------------------------------------------

class DefaultPolicy:
    """Integration policy for ACDS capability requests.

    Rules applied in order:
    1. Provider must be registered.
    2. Capability must be known and the provider must support it.
    3. ``local_only=True`` blocks any provider not in LOCAL_PROVIDERS.
    4. ``sensitivity=high`` blocks providers without encryption.
    """

    def evaluate(
        self,
        req: CapabilityRequest,
        provider_id: str,
    ) -> PolicyResult:
        """Evaluate whether *req* is allowed to execute on *provider_id*."""
        checks: list[str] = []

        # 1. Provider registration
        checks.append("provider_registered")
        known_providers = set()
        for providers in CAPABILITY_REGISTRY.values():
            known_providers.update(providers)
        if provider_id not in known_providers:
            return PolicyResult(
                allowed=False,
                reason=f"Provider '{provider_id}' is not registered",
                checks_performed=checks,
            )

        # 2. Capability support
        checks.append("capability_supported")
        supported = CAPABILITY_REGISTRY.get(req.capability)
        if supported is None:
            return PolicyResult(
                allowed=False,
                reason=f"Capability '{req.capability}' is not registered (CAPABILITY_UNAVAILABLE)",
                checks_performed=checks,
            )
        if provider_id not in supported:
            return PolicyResult(
                allowed=False,
                reason=f"Provider '{provider_id}' does not support '{req.capability}'",
                checks_performed=checks,
            )

        # 3. Local-only constraint
        checks.append("local_only")
        if req.constraints.local_only and provider_id not in LOCAL_PROVIDERS:
            return PolicyResult(
                allowed=False,
                reason=f"Provider '{provider_id}' is not local (local_only=True)",
                checks_performed=checks,
            )

        # 4. High-sensitivity encryption requirement
        checks.append("sensitivity_encryption")
        if req.constraints.sensitivity == "high" and provider_id not in ENCRYPTED_PROVIDERS:
            return PolicyResult(
                allowed=False,
                reason=f"Provider '{provider_id}' lacks encryption (sensitivity=high)",
                checks_performed=checks,
            )

        return PolicyResult(
            allowed=True,
            reason="all checks passed",
            checks_performed=checks,
        )
