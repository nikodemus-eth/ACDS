"""Retry and failure handling for ACDS integration.

RetryStrategy: configurable retry with exponential backoff
FailurePropagator: determines which errors are terminal vs retryable
"""

from __future__ import annotations

from swarm.integration.errors import (
    CapabilityUnavailableError,
    ContractViolationError,
    PolicyDeniedError,
    ProviderFailedError,
)


class RetryStrategy:
    """Configurable retry with exponential backoff.

    Parameters
    ----------
    max_retries:
        Maximum number of retry attempts per provider (default 2).
    backoff_base_ms:
        Base delay in milliseconds, doubled on each attempt.
    """

    def __init__(self, max_retries: int = 2, backoff_base_ms: int = 500):
        self.max_retries = max_retries
        self.backoff_base_ms = backoff_base_ms

    def should_retry(self, attempt: int, error: Exception) -> bool:
        """Return True if this error is retryable and attempts remain."""
        if attempt >= self.max_retries:
            return False
        return FailurePropagator.is_retryable(error)

    def delay_ms(self, attempt: int) -> int:
        """Exponential backoff: base * 2^attempt."""
        return self.backoff_base_ms * (2 ** attempt)


class FailurePropagator:
    """Determines how node failures affect the pipeline."""

    @staticmethod
    def is_terminal(error: Exception) -> bool:
        """PolicyDenied and ContractViolation are always terminal.

        Terminal errors must not be retried and must halt the pipeline.
        """
        return isinstance(error, (PolicyDeniedError, ContractViolationError))

    @staticmethod
    def is_retryable(error: Exception) -> bool:
        """ProviderFailed is retryable, CapabilityUnavailable is not.

        Only transient provider errors warrant a retry attempt.
        """
        if FailurePropagator.is_terminal(error):
            return False
        if isinstance(error, CapabilityUnavailableError):
            return False
        return isinstance(error, ProviderFailedError)
