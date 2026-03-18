"""Exception hierarchy for the OpenShell Layer.

All OpenShell exceptions inherit from OpenShellError so callers can
catch the entire family with a single except clause.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from swarm.openshell.models import PolicyDecision


class OpenShellError(Exception):
    """Base exception for all OpenShell operations."""


class NormalizationError(OpenShellError):
    """Raised when an action dict cannot be normalized into a CommandEnvelope."""


class ValidationError(OpenShellError):
    """Raised when envelope parameters fail schema validation."""

    def __init__(self, message: str, validation_errors: list[str]) -> None:
        super().__init__(message)
        self.validation_errors = validation_errors


class PolicyDeniedError(OpenShellError):
    """Raised when the policy engine denies a command envelope."""

    def __init__(self, message: str, decision: PolicyDecision) -> None:
        super().__init__(message)
        self.decision = decision


class ScopeViolationError(OpenShellError):
    """Raised when a command targets paths or hosts outside allowed scope."""

    def __init__(self, message: str, violations: list[str]) -> None:
        super().__init__(message)
        self.violations = violations


class ExecutionError(OpenShellError):
    """Raised when adapter execution fails unexpectedly."""


class LedgerIntegrityError(OpenShellError):
    """Raised when the audit ledger hash chain is broken."""
