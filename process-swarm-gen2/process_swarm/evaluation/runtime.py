"""Provider runtime and failure handling for ACDS evaluation.

Implements provider invocation, timeout handling, fallback orchestration,
and completeness checking.  All failure modes are ledger-visible.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from process_swarm.evaluation.validation import ValidationResult


@dataclass
class ProviderInvocationResult:
    """Result of a single provider invocation.

    Attributes:
        success:         True if the invocation completed successfully.
        provider_id:     Which provider was invoked.
        task_id:         The task that was invoked.
        error_type:      Type of error if failed (timeout, error, partial).
        provider_output: The raw provider output dict, or None on failure.
        fallback_used:   True if this result came from a fallback provider.
    """
    success: bool
    provider_id: str = ""
    task_id: str = ""
    error_type: Optional[str] = None
    provider_output: Optional[dict] = None
    fallback_used: bool = False


class ProviderRuntime:
    """Simulates provider invocation with deterministic failure modes.

    In the evaluation harness, actual HTTP calls are replaced by
    simulation flags that control the outcome.  Every invocation
    is recorded in the ledger when one is attached.
    """

    def __init__(self, ledger: Optional[object] = None) -> None:
        self._ledger = ledger

    def invoke(
        self,
        provider_id: str,
        task_id: str = "",
        workflow_id: str = "",
        *,
        simulate_timeout: bool = False,
        simulate_error: bool = False,
        simulate_partial: bool = False,
        partial_output: str = "...",
    ) -> ProviderInvocationResult:
        """Invoke a provider, returning an invocation result.

        Simulation flags control the outcome for testing:
        - simulate_timeout: simulates a provider timeout
        - simulate_error: simulates a provider error
        - simulate_partial: simulates truncated/incomplete output
        """
        if simulate_timeout:
            result = ProviderInvocationResult(
                success=False,
                provider_id=provider_id,
                task_id=task_id,
                error_type="timeout",
                provider_output=None,
            )
            self._record_invocation(
                provider_id=provider_id,
                task_id=task_id,
                workflow_id=workflow_id,
                status="timeout",
                error="Provider timeout exceeded",
            )
            return result

        if simulate_error:
            result = ProviderInvocationResult(
                success=False,
                provider_id=provider_id,
                task_id=task_id,
                error_type="error",
                provider_output=None,
            )
            self._record_invocation(
                provider_id=provider_id,
                task_id=task_id,
                workflow_id=workflow_id,
                status="error",
                error="Provider returned an error",
            )
            return result

        if simulate_partial:
            output = {
                "executionId": f"exec-{task_id}",
                "status": "completed",
                "normalizedOutput": partial_output,
            }
            result = ProviderInvocationResult(
                success=True,
                provider_id=provider_id,
                task_id=task_id,
                provider_output=output,
            )
            self._record_invocation(
                provider_id=provider_id,
                task_id=task_id,
                workflow_id=workflow_id,
                status="completed",
            )
            return result

        # Successful invocation
        output = {
            "executionId": f"exec-{task_id}",
            "status": "completed",
            "normalizedOutput": (
                f"Simulated successful output for task {task_id} "
                f"from provider {provider_id}"
            ),
        }
        result = ProviderInvocationResult(
            success=True,
            provider_id=provider_id,
            task_id=task_id,
            provider_output=output,
        )
        self._record_invocation(
            provider_id=provider_id,
            task_id=task_id,
            workflow_id=workflow_id,
            status="completed",
        )
        return result

    def _record_invocation(
        self,
        provider_id: str,
        task_id: str,
        workflow_id: str,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        if self._ledger is not None:
            self._ledger.record_provider_invoked(
                provider_id=provider_id,
                task_id=task_id,
                workflow_id=workflow_id,
                status=status,
                error=error,
            )


class CompletenessChecker:
    """Checks whether provider output meets minimum completeness criteria.

    Detects silent partial success: output that looks structurally valid
    but is too short or empty to be a real response.
    """

    def __init__(self, min_output_length: int = 10) -> None:
        self._min_length = min_output_length

    def check(self, provider_output: dict) -> ValidationResult:
        """Check output completeness.

        Returns a ValidationResult indicating whether the output
        meets minimum length requirements.
        """
        normalized = provider_output.get("normalizedOutput")
        if normalized is None:
            return ValidationResult.failure(
                ["normalizedOutput is None — silent partial success detected"]
            )
        if len(normalized) < self._min_length:
            return ValidationResult.failure(
                [
                    f"Output length {len(normalized)} below minimum "
                    f"{self._min_length} — possible truncation"
                ]
            )
        return ValidationResult.success()


class FallbackOrchestrator:
    """Orchestrates primary invocation with automatic fallback.

    Tries the primary provider (ACDS), checks for completeness,
    and falls back to baseline if the primary fails or produces
    incomplete output.  All events are recorded in the ledger.
    """

    def __init__(
        self,
        ledger: Optional[object] = None,
        min_output_length: int = 10,
    ) -> None:
        self._ledger = ledger
        self._runtime = ProviderRuntime(ledger=ledger)
        self._completeness = CompletenessChecker(min_output_length)

    def execute(
        self,
        task_id: str,
        task_type: str,
        workflow_id: str = "",
        *,
        simulate_primary_timeout: bool = False,
        simulate_primary_error: bool = False,
        simulate_primary_partial: bool = False,
    ) -> ProviderInvocationResult:
        """Execute a task with primary provider and automatic fallback."""
        # Try primary provider (ACDS)
        primary = self._runtime.invoke(
            provider_id="acds",
            task_id=task_id,
            workflow_id=workflow_id,
            simulate_timeout=simulate_primary_timeout,
            simulate_error=simulate_primary_error,
            simulate_partial=simulate_primary_partial,
        )

        # Check if primary succeeded
        if not primary.success:
            return self._fallback(
                task_id=task_id,
                workflow_id=workflow_id,
                reason=f"Primary provider failed: {primary.error_type}",
            )

        # Check completeness
        completeness = self._completeness.check(primary.provider_output)
        if not completeness.passed:
            return self._fallback(
                task_id=task_id,
                workflow_id=workflow_id,
                reason=f"Completeness check failed: {'; '.join(completeness.errors)}",
            )

        return primary

    def _fallback(
        self,
        task_id: str,
        workflow_id: str,
        reason: str,
    ) -> ProviderInvocationResult:
        """Execute fallback to baseline and record the event."""
        if self._ledger is not None:
            self._ledger.record_fallback(
                task_id=task_id,
                workflow_id=workflow_id,
                original_provider_id="acds",
                fallback_provider_id="baseline",
                reason=reason,
            )

        fallback_result = self._runtime.invoke(
            provider_id="baseline",
            task_id=task_id,
            workflow_id=workflow_id,
        )
        fallback_result.fallback_used = True
        return fallback_result
