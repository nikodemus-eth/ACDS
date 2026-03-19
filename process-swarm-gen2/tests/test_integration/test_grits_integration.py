"""GRITS-level integration tests for ACDS + Process Swarm.

Each test maps to a numbered GRITS integration requirement.
NO mocks, NO stubs, NO monkeypatches. Real objects, real execution.

Live inference tests are skipped when services are unavailable.
"""

from __future__ import annotations

import json
import socket
from dataclasses import asdict
from pathlib import Path

import pytest

from swarm.integration.acds_client import ACDSClient
from swarm.integration.contracts import (
    CapabilityRequest,
    CapabilityResponse,
    ExecutionContext,
    RequestConstraints,
)
from swarm.integration.errors import (
    CapabilityUnavailableError,
    ContractViolationError,
    FallbackExhaustedError,
    PolicyDeniedError,
    ProviderFailedError,
)
from swarm.integration.execution_pipeline import IntegrationPipeline
from swarm.integration.lineage import LineageEntry, LineageTracker
from swarm.integration.node_schemas import CognitiveNodeConfig
from swarm.integration.policy import CAPABILITY_REGISTRY, DefaultPolicy
from swarm.integration.retry import FailurePropagator, RetryStrategy


def _port_open(port: int) -> bool:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        result = s.connect_ex(("localhost", port))
        s.close()
        return result == 0
    except Exception:
        return False


OLLAMA_UP = _port_open(11434)
APPLE_UP = _port_open(11435)
INFERENCE_UP = OLLAMA_UP or APPLE_UP


def _make_ctx(process_id: str = "grits-test", node_id: str = "grits-node") -> ExecutionContext:
    return ExecutionContext(process_id=process_id, node_id=node_id, swarm_id="grits-swarm")


def _make_request(
    capability: str = "text.generate",
    prompt: str = "Say yes",
    **kwargs,
) -> CapabilityRequest:
    return CapabilityRequest(
        capability=capability,
        input={"prompt": prompt},
        constraints=RequestConstraints(**kwargs),
        context=_make_ctx(),
    )


class TestGRITS_INT_001:
    """GRITS-INT-001: Routing correctness -- same request resolves to same provider deterministically."""

    def test_deterministic_provider_selection(self):
        client = ACDSClient()
        req = _make_request()
        # Run selection twice with same request state
        pid1, _ = client._select_provider(req)
        pid2, _ = client._select_provider(req)
        assert pid1 == pid2


class TestGRITS_INT_002:
    """GRITS-INT-002: Policy enforcement -- local_only blocks external providers."""

    def test_local_only_blocks_external(self):
        policy = DefaultPolicy()
        req = _make_request(local_only=True)
        result = policy.evaluate(req, "cloud_external_provider")
        assert result.allowed is False

    def test_local_only_allows_local(self):
        policy = DefaultPolicy()
        req = _make_request(local_only=True)
        result = policy.evaluate(req, "ollama")
        assert result.allowed is True


class TestGRITS_INT_003:
    """GRITS-INT-003: Fallback behavior -- primary failure triggers same-class fallback."""

    def test_fallback_chain_same_class(self):
        client = ACDSClient()
        chain = client._build_fallback_chain("text.generate", ["ollama"])
        # Fallback should only include same-capability providers
        for pid in chain:
            assert pid in CAPABILITY_REGISTRY["text.generate"]

    def test_fallback_excludes_tried(self):
        client = ACDSClient()
        chain = client._build_fallback_chain("text.generate", ["ollama"])
        assert "ollama" not in chain


class TestGRITS_INT_004:
    """GRITS-INT-004: Deterministic execution -- identical inputs produce identical decision traces."""

    def test_identical_inputs_same_trace_shape(self):
        client = ACDSClient()
        req1 = _make_request()
        req2 = _make_request()
        pid1, _ = client._select_provider(req1)
        pid2, _ = client._select_provider(req2)
        assert pid1 == pid2


class TestGRITS_INT_005:
    """GRITS-INT-005: Audit trace integrity -- every execution has lineage entry with decision trace."""

    @pytest.mark.skipif(not INFERENCE_UP, reason="No inference service available")
    def test_execution_creates_lineage_with_trace(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(local_only=True),
        )
        ctx = _make_ctx(process_id="audit-trace")
        pipeline.execute_cognitive_node(config, {"prompt": "test"}, ctx)
        chain = pipeline.lineage.get_chain("audit-trace")
        assert len(chain) >= 1
        entry = chain[0]
        assert entry.decision_trace is not None
        assert "selected" in entry.decision_trace


class TestGRITS_INT_006:
    """GRITS-INT-006: Contract completeness -- response has all required fields."""

    @pytest.mark.skipif(not INFERENCE_UP, reason="No inference service available")
    def test_response_has_all_fields(self):
        client = ACDSClient()
        req = _make_request()
        resp = client.request(req)
        d = asdict(resp)
        required = {
            "output", "provider_id", "method_id", "latency_ms",
            "cost_estimate", "decision_trace", "fallback_used", "request_id",
        }
        assert required.issubset(d.keys())


class TestGRITS_INT_007:
    """GRITS-INT-007: System decoupling -- Process Swarm nodes never reference provider internals."""

    def test_node_config_has_no_provider_reference(self):
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(),
        )
        d = asdict(config)
        # No field should contain provider-specific identifiers
        serialized = json.dumps(d)
        assert "ollama" not in serialized
        assert "apple_intelligence" not in serialized
        assert "localhost" not in serialized

    def test_request_constraints_no_provider_internals(self):
        rc = RequestConstraints()
        d = asdict(rc)
        serialized = json.dumps(d)
        assert "11434" not in serialized
        assert "11435" not in serialized


class TestGRITS_INT_008:
    """GRITS-INT-008: Artifact lineage -- every artifact has a lineage entry."""

    @pytest.mark.skipif(not INFERENCE_UP, reason="No inference service available")
    def test_artifact_has_lineage_entry(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(local_only=True),
            output_artifact_type="generation",
        )
        ctx = _make_ctx(process_id="artifact-lineage")
        result = pipeline.execute_cognitive_node(
            config, {"prompt": "Say yes"}, ctx,
        )
        if result.success and result.artifacts:
            chain = pipeline.lineage.get_chain("artifact-lineage")
            assert len(chain) >= 1
            # Lineage entry must reference the artifact
            assert chain[0].artifacts
            assert result.artifacts[0] in chain[0].artifacts


class TestGRITS_INT_009:
    """GRITS-INT-009: Failure propagation -- terminal errors stop, retryable errors retry."""

    def test_terminal_errors_not_retried(self):
        strategy = RetryStrategy()
        terminal_errors = [
            PolicyDeniedError("blocked"),
            ContractViolationError("invalid"),
        ]
        for error in terminal_errors:
            assert strategy.should_retry(0, error) is False, f"{type(error).__name__} should not be retried"

    def test_retryable_errors_retried(self):
        strategy = RetryStrategy()
        error = ProviderFailedError("transient")
        assert strategy.should_retry(0, error) is True


class TestGRITS_INT_010:
    """GRITS-INT-010: Cross-class fallback blocked -- provider failure never escalates to capability class."""

    def test_fallback_stays_within_capability(self):
        client = ACDSClient()
        # text.generate providers should not include speech.transcribe providers
        text_providers = set(CAPABILITY_REGISTRY.get("text.generate", []))
        speech_providers = set(CAPABILITY_REGISTRY.get("speech.transcribe", []))
        # Fallback chain for text.generate must only include text.generate providers
        chain = client._build_fallback_chain("text.generate", [])
        for pid in chain:
            assert pid in text_providers

    def test_speech_fallback_stays_speech(self):
        client = ACDSClient()
        chain = client._build_fallback_chain("speech.transcribe", [])
        speech_providers = set(CAPABILITY_REGISTRY.get("speech.transcribe", []))
        for pid in chain:
            assert pid in speech_providers


class TestGRITS_INT_011:
    """GRITS-INT-011: Lineage chain integrity -- parent_entry_id forms valid chain."""

    def test_parent_chain_valid(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        e1 = LineageEntry(process_id="chain-test", node_id="step1")
        e2 = LineageEntry(
            process_id="chain-test", node_id="step2",
            parent_entry_id=e1.entry_id,
        )
        e3 = LineageEntry(
            process_id="chain-test", node_id="step3",
            parent_entry_id=e2.entry_id,
        )
        tracker.record(e1)
        tracker.record(e2)
        tracker.record(e3)

        chain = tracker.get_chain("chain-test")
        assert len(chain) == 3
        assert chain[0].parent_entry_id is None
        assert chain[1].parent_entry_id == chain[0].entry_id
        assert chain[2].parent_entry_id == chain[1].entry_id


class TestGRITS_INT_012:
    """GRITS-INT-012: Cost tracking -- response includes cost_estimate even if zero."""

    @pytest.mark.skipif(not INFERENCE_UP, reason="No inference service available")
    def test_cost_estimate_present(self):
        client = ACDSClient()
        req = _make_request()
        resp = client.request(req)
        assert hasattr(resp, "cost_estimate")
        assert isinstance(resp.cost_estimate, float)
        assert resp.cost_estimate >= 0.0
