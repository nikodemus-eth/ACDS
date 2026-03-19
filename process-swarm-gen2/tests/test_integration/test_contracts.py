"""GRITS tests for integration boundary contracts.

Tests contract schemas, defaults, auto-generation, serialization,
and round-trip integrity. NO mocks, NO stubs, NO monkeypatches.
"""

from __future__ import annotations

from dataclasses import asdict

from swarm.integration.contracts import (
    CapabilityRequest,
    CapabilityResponse,
    DecisionTrace,
    ExecutionContext,
    IntegrationError,
    RequestConstraints,
    _now_utc,
    _short_id,
)


class TestRequestConstraintsDefaults:
    """RequestConstraints must ship safe defaults."""

    def test_local_only_defaults_true(self):
        rc = RequestConstraints()
        assert rc.local_only is True

    def test_sensitivity_defaults_medium(self):
        rc = RequestConstraints()
        assert rc.sensitivity == "medium"

    def test_max_latency_defaults_none(self):
        rc = RequestConstraints()
        assert rc.max_latency_ms is None

    def test_max_cost_defaults_none(self):
        rc = RequestConstraints()
        assert rc.max_cost is None

    def test_preferred_provider_defaults_none(self):
        rc = RequestConstraints()
        assert rc.preferred_provider is None


class TestExecutionContext:
    """ExecutionContext requires all identity fields."""

    def test_requires_process_id(self):
        ctx = ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1")
        assert ctx.process_id == "p1"

    def test_auto_generates_correlation_id(self):
        ctx = ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1")
        assert ctx.correlation_id
        assert len(ctx.correlation_id) == 12

    def test_two_contexts_get_different_correlation_ids(self):
        ctx1 = ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1")
        ctx2 = ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1")
        assert ctx1.correlation_id != ctx2.correlation_id


class TestCapabilityRequest:
    """CapabilityRequest auto-generates request_id and holds all fields."""

    def test_auto_generates_request_id(self):
        req = CapabilityRequest(
            capability="text.generate",
            input={"prompt": "hello"},
            constraints=RequestConstraints(),
            context=ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1"),
        )
        assert req.request_id
        assert len(req.request_id) == 12

    def test_two_requests_get_different_ids(self):
        kwargs = dict(
            capability="text.generate",
            input={"prompt": "hello"},
            constraints=RequestConstraints(),
            context=ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1"),
        )
        r1 = CapabilityRequest(**kwargs)
        r2 = CapabilityRequest(**kwargs)
        assert r1.request_id != r2.request_id

    def test_request_holds_capability(self):
        req = CapabilityRequest(
            capability="text.summarize",
            input={"text": "data"},
            constraints=RequestConstraints(),
            context=ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1"),
        )
        assert req.capability == "text.summarize"


class TestCapabilityResponse:
    """CapabilityResponse includes all required metadata."""

    def test_response_has_all_fields(self):
        trace = DecisionTrace(
            candidates_evaluated=["ollama"],
            selected_provider="ollama",
            selection_reason="only candidate",
        )
        resp = CapabilityResponse(
            output={"text": "result"},
            provider_id="ollama",
            method_id="text.generate",
            latency_ms=42,
            cost_estimate=0.0,
            decision_trace=trace,
            fallback_used=False,
            request_id="abc123def456",
        )
        d = asdict(resp)
        for key in ("output", "provider_id", "method_id", "latency_ms",
                     "cost_estimate", "decision_trace", "fallback_used", "request_id"):
            assert key in d


class TestDecisionTrace:
    """DecisionTrace captures candidate list and selection reason."""

    def test_captures_candidates(self):
        trace = DecisionTrace(
            candidates_evaluated=["ollama", "apple_intelligence"],
            selected_provider="ollama",
            selection_reason="highest score",
        )
        assert len(trace.candidates_evaluated) == 2

    def test_has_timestamp(self):
        trace = DecisionTrace()
        assert trace.timestamp
        assert "T" in trace.timestamp  # ISO-8601


class TestIntegrationErrorContract:
    """IntegrationError (dataclass) has all required fields."""

    def test_has_all_required_fields(self):
        err = IntegrationError(
            error_code="POLICY_DENIED",
            message="blocked",
            request_id="req123",
        )
        d = asdict(err)
        assert d["error_code"] == "POLICY_DENIED"
        assert d["message"] == "blocked"
        assert d["request_id"] == "req123"
        assert d["retry_eligible"] is False
        assert d["fallback_exhausted"] is False


class TestContractRoundTrip:
    """Create request -> serialize to dict -> verify all fields present."""

    def test_request_round_trip(self):
        ctx = ExecutionContext(process_id="p1", node_id="n1", swarm_id="s1")
        req = CapabilityRequest(
            capability="text.generate",
            input={"prompt": "test"},
            constraints=RequestConstraints(sensitivity="high"),
            context=ctx,
        )
        d = asdict(req)
        assert d["capability"] == "text.generate"
        assert d["input"]["prompt"] == "test"
        assert d["constraints"]["sensitivity"] == "high"
        assert d["context"]["process_id"] == "p1"
        assert len(d["request_id"]) == 12
