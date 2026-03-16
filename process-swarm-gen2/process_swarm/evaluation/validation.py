"""Validation gates for ACDS provider output.

Implements structural validation, output format checks, constraint
compliance, and the acceptance gate that links validation outcomes
to provider events in the ledger.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# Supported output formats that Process Swarm can consume.
_SUPPORTED_OUTPUT_FORMATS = {"text", "json"}


@dataclass
class ValidationResult:
    """Outcome of a validation check.

    Attributes:
        passed: True if all checks passed.
        errors: List of human-readable error descriptions.
    """
    passed: bool
    errors: list[str] = field(default_factory=list)

    @classmethod
    def success(cls) -> ValidationResult:
        return cls(passed=True, errors=[])

    @classmethod
    def failure(cls, errors: list[str]) -> ValidationResult:
        return cls(passed=False, errors=errors)


class ProviderOutputValidator:
    """Validates structural integrity of provider output.

    Checks:
    - Output is not None
    - Required fields present: executionId, normalizedOutput
    - normalizedOutput is non-empty
    - status is 'completed'
    - outputFormat is supported (text, json)
    """

    def validate(self, provider_output: Optional[dict]) -> ValidationResult:
        """Validate a provider output dict.

        Returns a ValidationResult with all detected errors collected.
        """
        errors: list[str] = []

        if provider_output is None:
            return ValidationResult.failure(
                ["Provider output is null/None"]
            )

        if "executionId" not in provider_output:
            errors.append("Missing required field 'executionId'")

        if "normalizedOutput" not in provider_output:
            errors.append("Missing required field 'normalizedOutput'")
        elif not provider_output["normalizedOutput"]:
            errors.append("Field 'normalizedOutput' is empty")

        status = provider_output.get("status", "")
        if status != "completed":
            errors.append(
                f"Status is '{status}', expected 'completed'"
            )

        output_format = provider_output.get("outputFormat", "text")
        if output_format not in _SUPPORTED_OUTPUT_FORMATS:
            errors.append(
                f"Unsupported output format '{output_format}' — "
                f"expected one of: {', '.join(sorted(_SUPPORTED_OUTPUT_FORMATS))}"
            )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class ConstraintValidator:
    """Validates that provider output complies with routing constraints.

    Checks:
    - maxLatencyMs: actual latency must not exceed the constraint
    - structuredOutputRequired: output format must be json if True
    """

    def validate(
        self,
        provider_output: dict,
        constraints: dict,
    ) -> ValidationResult:
        """Validate provider output against the given constraints.

        Returns a ValidationResult with all detected violations collected.
        """
        errors: list[str] = []

        max_latency = constraints.get("maxLatencyMs")
        if max_latency is not None:
            actual_latency = provider_output.get("latencyMs", 0)
            if actual_latency > max_latency:
                errors.append(
                    f"Latency {actual_latency}ms exceeds maximum "
                    f"{max_latency}ms"
                )

        structured_required = constraints.get("structuredOutputRequired", False)
        if structured_required:
            output_format = provider_output.get("outputFormat", "text")
            if output_format != "json":
                errors.append(
                    f"Structured output required but format is "
                    f"'{output_format}', expected 'json'"
                )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class AcceptanceGate:
    """Orchestrates validation and records outcomes in the ledger.

    Runs structural validation (ProviderOutputValidator) and constraint
    validation (ConstraintValidator), merges all errors, and records
    the combined outcome as a validation_outcome event linked to the
    originating provider event.
    """

    def __init__(self, ledger: object) -> None:
        self._ledger = ledger
        self._output_validator = ProviderOutputValidator()
        self._constraint_validator = ConstraintValidator()

    def evaluate(
        self,
        provider_output: Optional[dict],
        provider_event_id: str,
        task_id: str = "",
        workflow_id: str = "",
        constraints: Optional[dict] = None,
    ) -> ValidationResult:
        """Run all validation checks and record the outcome.

        Returns the merged ValidationResult.
        """
        all_errors: list[str] = []

        # Structural validation
        structural = self._output_validator.validate(provider_output)
        all_errors.extend(structural.errors)

        # Constraint validation (only if we have constraints and a valid dict)
        if constraints and provider_output is not None:
            constraint_result = self._constraint_validator.validate(
                provider_output, constraints,
            )
            all_errors.extend(constraint_result.errors)

        passed = len(all_errors) == 0
        result = ValidationResult(passed=passed, errors=all_errors)

        # Record in ledger
        self._ledger.record_validation_outcome(
            task_id=task_id,
            workflow_id=workflow_id,
            provider_event_id=provider_event_id,
            validation_passed=passed,
            validation_errors=all_errors if all_errors else None,
        )

        return result
