"""Exception hierarchy for the ARGUS-Hold Layer.

All ARGUS-Hold exceptions inherit from ARGUSHoldError so callers can
catch the entire family with a single except clause.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from swarm.argus_hold.models import PolicyDecision


class ARGUSHoldError(Exception):
    """Base exception for all ARGUS-Hold operations."""


class NormalizationError(ARGUSHoldError):
    """Raised when an action dict cannot be normalized into a CommandEnvelope."""


class ValidationError(ARGUSHoldError):
    """Raised when envelope parameters fail schema validation."""

    def __init__(self, message: str, validation_errors: list[str]) -> None:
        super().__init__(message)
        self.validation_errors = validation_errors


class PolicyDeniedError(ARGUSHoldError):
    """Raised when the policy engine denies a command envelope."""

    def __init__(self, message: str, decision: PolicyDecision) -> None:
        super().__init__(message)
        self.decision = decision


class ScopeViolationError(ARGUSHoldError):
    """Raised when a command targets paths or hosts outside allowed scope."""

    def __init__(self, message: str, violations: list[str]) -> None:
        super().__init__(message)
        self.violations = violations


class ExecutionError(ARGUSHoldError):
    """Raised when adapter execution fails unexpectedly."""


class LedgerIntegrityError(ARGUSHoldError):
    """Raised when the audit ledger hash chain is broken."""
