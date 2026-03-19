"""GRITS tests for retry and failure handling.

Tests RetryStrategy, exponential backoff, and FailurePropagator
classifications. NO mocks, NO stubs, NO monkeypatches.
"""

from __future__ import annotations

from swarm.integration.errors import (
    CapabilityUnavailableError,
    ContractViolationError,
    PolicyDeniedError,
    ProviderFailedError,
)
from swarm.integration.retry import FailurePropagator, RetryStrategy


class TestRetryStrategyAttempts:
    """RetryStrategy allows/blocks retries based on attempt count."""

    def test_allows_retry_on_attempt_0(self):
        strategy = RetryStrategy(max_retries=2)
        error = ProviderFailedError("transient")
        assert strategy.should_retry(0, error) is True

    def test_allows_retry_on_attempt_1(self):
        strategy = RetryStrategy(max_retries=2)
        error = ProviderFailedError("transient")
        assert strategy.should_retry(1, error) is True

    def test_blocks_retry_on_attempt_at_max(self):
        strategy = RetryStrategy(max_retries=2)
        error = ProviderFailedError("transient")
        assert strategy.should_retry(2, error) is False

    def test_blocks_retry_on_attempt_beyond_max(self):
        strategy = RetryStrategy(max_retries=2)
        error = ProviderFailedError("transient")
        assert strategy.should_retry(5, error) is False


class TestExponentialBackoff:
    """Exponential backoff: attempt 0 = base, attempt 1 = base*2, etc."""

    def test_attempt_0_returns_base(self):
        strategy = RetryStrategy(backoff_base_ms=500)
        assert strategy.delay_ms(0) == 500

    def test_attempt_1_returns_double(self):
        strategy = RetryStrategy(backoff_base_ms=500)
        assert strategy.delay_ms(1) == 1000

    def test_attempt_2_returns_quadruple(self):
        strategy = RetryStrategy(backoff_base_ms=500)
        assert strategy.delay_ms(2) == 2000

    def test_custom_base(self):
        strategy = RetryStrategy(backoff_base_ms=100)
        assert strategy.delay_ms(0) == 100
        assert strategy.delay_ms(1) == 200
        assert strategy.delay_ms(2) == 400


class TestFailurePropagatorTerminal:
    """Terminal errors: PolicyDenied and ContractViolation."""

    def test_policy_denied_is_terminal(self):
        error = PolicyDeniedError("blocked")
        assert FailurePropagator.is_terminal(error) is True

    def test_contract_violation_is_terminal(self):
        error = ContractViolationError("invalid schema")
        assert FailurePropagator.is_terminal(error) is True

    def test_provider_failed_is_not_terminal(self):
        error = ProviderFailedError("timeout")
        assert FailurePropagator.is_terminal(error) is False

    def test_capability_unavailable_is_not_terminal(self):
        error = CapabilityUnavailableError("no providers")
        assert FailurePropagator.is_terminal(error) is False


class TestFailurePropagatorRetryable:
    """Retryable classification for different error types."""

    def test_provider_failed_is_retryable(self):
        error = ProviderFailedError("transient")
        assert FailurePropagator.is_retryable(error) is True

    def test_capability_unavailable_is_not_retryable(self):
        error = CapabilityUnavailableError("no providers")
        assert FailurePropagator.is_retryable(error) is False

    def test_policy_denied_is_not_retryable(self):
        error = PolicyDeniedError("blocked")
        assert FailurePropagator.is_retryable(error) is False

    def test_contract_violation_is_not_retryable(self):
        error = ContractViolationError("invalid")
        assert FailurePropagator.is_retryable(error) is False

    def test_generic_exception_is_not_retryable(self):
        # Generic Exception is not ProviderFailedError, so not retryable
        error = Exception("something")
        assert FailurePropagator.is_retryable(error) is False
