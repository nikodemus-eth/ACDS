"""Integration-specific error types for ACDS capability dispatch.

All errors inherit from IntegrationError so callers can catch
the entire family with a single except clause.
"""

from __future__ import annotations


class IntegrationError(Exception):
    """Base error for all ACDS integration failures."""


class CapabilityUnavailableError(IntegrationError):
    """Requested capability is not registered or not currently available."""


class PolicyDeniedError(IntegrationError):
    """Request was denied by ACDS policy evaluation."""


class ProviderFailedError(IntegrationError):
    """The selected provider returned an error during execution."""


class FallbackExhaustedError(IntegrationError):
    """All providers in the fallback chain failed."""


class ContractViolationError(IntegrationError):
    """Request or response violated the integration contract schema."""
