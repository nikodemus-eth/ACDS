"""Phase 2 — Validation Gates.

Tests for:
  UC-ACDS-011  Reject malformed provider output
  UC-ACDS-012  Reject unsupported ranked output format
  UC-ACDS-013  Enforce constraint compliance
  UC-ACDS-021  Link validation outcomes to provider events

All tests written FIRST (TDD red phase).  Implementation follows.
"""
from __future__ import annotations

import pytest

from process_swarm.acds_client import TaskType


# ──────────────────────────────────────────────
# UC-ACDS-011  Reject malformed provider output
# ──────────────────────────────────────────────


class TestMalformedOutputRejection:
    """Validation gate must reject structurally invalid provider output."""

    def test_missing_normalized_output_fails_validation(self):
        """A response with no normalizedOutput is malformed."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
            ValidationResult,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-001",
            "status": "completed",
            # normalizedOutput missing
        })

        assert not result.passed
        assert any("normalizedOutput" in e for e in result.errors)

    def test_empty_normalized_output_fails_validation(self):
        """A response with an empty normalizedOutput is malformed."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-002",
            "status": "completed",
            "normalizedOutput": "",
        })

        assert not result.passed
        assert any("empty" in e.lower() for e in result.errors)

    def test_missing_execution_id_fails_validation(self):
        """A response without executionId cannot be traced."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "status": "completed",
            "normalizedOutput": "Some output text",
            # executionId missing
        })

        assert not result.passed
        assert any("executionId" in e for e in result.errors)

    def test_non_completed_status_fails_validation(self):
        """A response with status != 'completed' is not acceptable."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-003",
            "status": "error",
            "normalizedOutput": "Some output text",
        })

        assert not result.passed
        assert any("status" in e.lower() for e in result.errors)

    def test_valid_output_passes_validation(self):
        """A well-formed response passes structural validation."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-004",
            "status": "completed",
            "normalizedOutput": "Valid output text",
        })

        assert result.passed
        assert result.errors == []

    def test_none_output_fails_validation(self):
        """A None provider output is rejected immediately."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output=None)

        assert not result.passed
        assert any("null" in e.lower() or "none" in e.lower() for e in result.errors)


# ──────────────────────────────────────────────
# UC-ACDS-012  Reject unsupported ranked output
# ──────────────────────────────────────────────


class TestRankedOutputRejection:
    """Validation gate must reject output formats that Process Swarm
    does not support, specifically ranked/list output when plain text
    is expected."""

    def test_ranked_output_format_rejected(self):
        """Output with outputFormat='ranked_list' is not supported."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-010",
            "status": "completed",
            "normalizedOutput": "[1] First\n[2] Second",
            "outputFormat": "ranked_list",
        })

        assert not result.passed
        assert any("format" in e.lower() or "ranked" in e.lower() for e in result.errors)

    def test_json_array_output_format_rejected(self):
        """Output with outputFormat='json_array' is not supported."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-011",
            "status": "completed",
            "normalizedOutput": '[{"rank":1},{"rank":2}]',
            "outputFormat": "json_array",
        })

        assert not result.passed
        assert any("format" in e.lower() for e in result.errors)

    def test_text_output_format_accepted(self):
        """Output with outputFormat='text' (the default) is accepted."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-012",
            "status": "completed",
            "normalizedOutput": "Plain text output",
            "outputFormat": "text",
        })

        assert result.passed

    def test_json_output_format_accepted(self):
        """Output with outputFormat='json' is accepted (structured output)."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-013",
            "status": "completed",
            "normalizedOutput": '{"key": "value"}',
            "outputFormat": "json",
        })

        assert result.passed

    def test_missing_output_format_defaults_to_text(self):
        """When outputFormat is absent, assume 'text' — accepted."""
        from process_swarm.evaluation.validation import (
            ProviderOutputValidator,
        )

        validator = ProviderOutputValidator()
        result = validator.validate(provider_output={
            "executionId": "exec-014",
            "status": "completed",
            "normalizedOutput": "Output without format field",
        })

        assert result.passed


# ──────────────────────────────────────────────
# UC-ACDS-013  Enforce constraint compliance
# ──────────────────────────────────────────────


class TestConstraintCompliance:
    """Validation gate must reject output that violates the constraints
    specified in the original routing request."""

    def test_latency_exceeding_max_fails(self):
        """Response that exceeded maxLatencyMs constraint is rejected."""
        from process_swarm.evaluation.validation import (
            ConstraintValidator,
        )

        validator = ConstraintValidator()
        result = validator.validate(
            provider_output={
                "executionId": "exec-020",
                "status": "completed",
                "normalizedOutput": "Output text",
                "latencyMs": 5000,
            },
            constraints={
                "maxLatencyMs": 2000,
            },
        )

        assert not result.passed
        assert any("latency" in e.lower() for e in result.errors)

    def test_latency_within_max_passes(self):
        """Response within maxLatencyMs constraint passes."""
        from process_swarm.evaluation.validation import (
            ConstraintValidator,
        )

        validator = ConstraintValidator()
        result = validator.validate(
            provider_output={
                "executionId": "exec-021",
                "status": "completed",
                "normalizedOutput": "Output text",
                "latencyMs": 1500,
            },
            constraints={
                "maxLatencyMs": 2000,
            },
        )

        assert result.passed

    def test_structured_output_required_but_format_is_text(self):
        """When structuredOutputRequired=True but format is text, fail."""
        from process_swarm.evaluation.validation import (
            ConstraintValidator,
        )

        validator = ConstraintValidator()
        result = validator.validate(
            provider_output={
                "executionId": "exec-022",
                "status": "completed",
                "normalizedOutput": "Just plain text, not JSON",
                "outputFormat": "text",
            },
            constraints={
                "structuredOutputRequired": True,
            },
        )

        assert not result.passed
        assert any("structured" in e.lower() for e in result.errors)

    def test_structured_output_required_and_format_is_json(self):
        """When structuredOutputRequired=True and format is json, pass."""
        from process_swarm.evaluation.validation import (
            ConstraintValidator,
        )

        validator = ConstraintValidator()
        result = validator.validate(
            provider_output={
                "executionId": "exec-023",
                "status": "completed",
                "normalizedOutput": '{"data": "value"}',
                "outputFormat": "json",
            },
            constraints={
                "structuredOutputRequired": True,
            },
        )

        assert result.passed

    def test_no_constraints_always_passes(self):
        """When no constraints are specified, validation always passes."""
        from process_swarm.evaluation.validation import (
            ConstraintValidator,
        )

        validator = ConstraintValidator()
        result = validator.validate(
            provider_output={
                "executionId": "exec-024",
                "status": "completed",
                "normalizedOutput": "Output text",
            },
            constraints={},
        )

        assert result.passed

    def test_multiple_constraint_violations_reported(self):
        """All constraint violations are collected, not just the first."""
        from process_swarm.evaluation.validation import (
            ConstraintValidator,
        )

        validator = ConstraintValidator()
        result = validator.validate(
            provider_output={
                "executionId": "exec-025",
                "status": "completed",
                "normalizedOutput": "Plain text",
                "outputFormat": "text",
                "latencyMs": 10000,
            },
            constraints={
                "maxLatencyMs": 2000,
                "structuredOutputRequired": True,
            },
        )

        assert not result.passed
        assert len(result.errors) >= 2


# ──────────────────────────────────────────────
# UC-ACDS-021  Link validation outcomes to provider events
# ──────────────────────────────────────────────


class TestValidationLedgerLinkage:
    """Every validation outcome must link back to the provider event
    that produced the output being validated."""

    def test_acceptance_gate_records_validation_in_ledger(self):
        """Running output through the acceptance gate records a
        validation_outcome event in the ledger."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.validation import AcceptanceGate

        ledger = ProviderEventLedger()
        gate = AcceptanceGate(ledger=ledger)

        # Simulate a provider event that produced this output
        provider_event = ledger.record_provider_invoked(
            provider_id="acds",
            task_id="task-100",
            workflow_id="wf-100",
            latency_ms=500,
            status="completed",
        )

        gate.evaluate(
            provider_output={
                "executionId": "exec-100",
                "status": "completed",
                "normalizedOutput": "Valid output",
            },
            provider_event_id=provider_event["event_id"],
            task_id="task-100",
            workflow_id="wf-100",
        )

        val_events = ledger.get_events(event_type="validation_outcome")
        assert len(val_events) == 1
        assert val_events[0]["provider_event_id"] == provider_event["event_id"]
        assert val_events[0]["validation_passed"] is True

    def test_failed_validation_recorded_in_ledger(self):
        """A failed validation is also recorded in the ledger."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.validation import AcceptanceGate

        ledger = ProviderEventLedger()
        gate = AcceptanceGate(ledger=ledger)

        provider_event = ledger.record_provider_invoked(
            provider_id="acds",
            task_id="task-101",
            workflow_id="wf-101",
            latency_ms=500,
            status="completed",
        )

        gate.evaluate(
            provider_output={
                "executionId": "exec-101",
                "status": "error",  # malformed
                "normalizedOutput": "Output",
            },
            provider_event_id=provider_event["event_id"],
            task_id="task-101",
            workflow_id="wf-101",
        )

        val_events = ledger.get_events(event_type="validation_outcome")
        assert len(val_events) == 1
        assert val_events[0]["validation_passed"] is False
        assert len(val_events[0]["validation_errors"]) > 0

    def test_validation_event_links_to_correct_provider_event(self):
        """With multiple provider events, each validation links to its own."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.validation import AcceptanceGate

        ledger = ProviderEventLedger()
        gate = AcceptanceGate(ledger=ledger)

        ev1 = ledger.record_provider_invoked(
            provider_id="acds", task_id="task-200",
            latency_ms=100, status="completed",
        )
        ev2 = ledger.record_provider_invoked(
            provider_id="acds", task_id="task-201",
            latency_ms=200, status="completed",
        )

        gate.evaluate(
            provider_output={
                "executionId": "exec-200",
                "status": "completed",
                "normalizedOutput": "Output A",
            },
            provider_event_id=ev1["event_id"],
            task_id="task-200",
        )
        gate.evaluate(
            provider_output={
                "executionId": "exec-201",
                "status": "completed",
                "normalizedOutput": "Output B",
            },
            provider_event_id=ev2["event_id"],
            task_id="task-201",
        )

        val_events = ledger.get_events(event_type="validation_outcome")
        assert len(val_events) == 2
        assert val_events[0]["provider_event_id"] == ev1["event_id"]
        assert val_events[1]["provider_event_id"] == ev2["event_id"]

    def test_acceptance_gate_returns_validation_result(self):
        """The gate.evaluate() call returns the ValidationResult."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.validation import AcceptanceGate

        ledger = ProviderEventLedger()
        gate = AcceptanceGate(ledger=ledger)

        provider_event = ledger.record_provider_invoked(
            provider_id="acds", task_id="task-300",
            latency_ms=100, status="completed",
        )

        result = gate.evaluate(
            provider_output={
                "executionId": "exec-300",
                "status": "completed",
                "normalizedOutput": "Valid output",
            },
            provider_event_id=provider_event["event_id"],
            task_id="task-300",
        )

        assert result.passed is True
        assert result.errors == []

    def test_acceptance_gate_with_constraint_violation(self):
        """The gate also evaluates constraints when provided."""
        from process_swarm.evaluation.ledger import ProviderEventLedger
        from process_swarm.evaluation.validation import AcceptanceGate

        ledger = ProviderEventLedger()
        gate = AcceptanceGate(ledger=ledger)

        provider_event = ledger.record_provider_invoked(
            provider_id="acds", task_id="task-301",
            latency_ms=5000, status="completed",
        )

        result = gate.evaluate(
            provider_output={
                "executionId": "exec-301",
                "status": "completed",
                "normalizedOutput": "Valid output",
                "latencyMs": 5000,
            },
            provider_event_id=provider_event["event_id"],
            task_id="task-301",
            constraints={"maxLatencyMs": 2000},
        )

        assert result.passed is False
        assert any("latency" in e.lower() for e in result.errors)

        # Ledger should reflect the failure
        val_events = ledger.get_events(event_type="validation_outcome")
        assert val_events[0]["validation_passed"] is False
