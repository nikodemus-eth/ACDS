"""GRITS tests for the ACDS client adapter.

Tests provider selection, policy enforcement, fallback, retry,
scoring, and response structure. NO mocks, NO stubs, NO monkeypatches.

Live inference tests are skipped when services are unavailable.
"""

from __future__ import annotations

import socket

import pytest

from swarm.integration.acds_client import ACDSClient, _PROVIDER_META
from swarm.integration.contracts import (
    CapabilityRequest,
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
from swarm.tools.inference_engines import AppleIntelligenceClient, OllamaClient


def _port_open(port: int) -> bool:
    """Check if a local port is accepting connections."""
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


def _make_ctx() -> ExecutionContext:
    return ExecutionContext(process_id="test-proc", node_id="test-node", swarm_id="test-swarm")


def _make_request(
    capability: str = "text.generate",
    prompt: str = "Say hello",
    **constraint_kwargs,
) -> CapabilityRequest:
    return CapabilityRequest(
        capability=capability,
        input={"prompt": prompt},
        constraints=RequestConstraints(**constraint_kwargs),
        context=_make_ctx(),
    )


class TestClientInitialization:
    """Client initializes with default providers."""

    def test_default_providers_created(self):
        client = ACDSClient()
        assert "ollama" in client._providers
        assert "apple_intelligence" in client._providers

    def test_default_providers_are_real_instances(self):
        client = ACDSClient()
        assert isinstance(client._providers["ollama"], OllamaClient)
        assert isinstance(client._providers["apple_intelligence"], AppleIntelligenceClient)

    def test_custom_providers_accepted(self):
        custom = {"test_provider": object()}
        client = ACDSClient(providers=custom)
        assert "test_provider" in client._providers
        assert "ollama" not in client._providers


class TestProviderSelection:
    """Provider scoring prefers available providers."""

    def test_provider_meta_has_ollama(self):
        assert "ollama" in _PROVIDER_META

    def test_provider_meta_has_apple(self):
        assert "apple_intelligence" in _PROVIDER_META

    def test_provider_meta_local_flag(self):
        assert _PROVIDER_META["ollama"]["local"] is True
        assert _PROVIDER_META["apple_intelligence"]["local"] is True


class TestUnknownCapability:
    """Unknown capability returns error."""

    def test_unknown_capability_raises(self):
        client = ACDSClient()
        req = _make_request(capability="nonexistent.capability")
        with pytest.raises(CapabilityUnavailableError):
            client.request(req)


class TestValidation:
    """Validate request contract compliance."""

    def test_empty_capability_raises(self):
        client = ACDSClient()
        req = CapabilityRequest(
            capability="",
            input={"prompt": "test"},
            constraints=RequestConstraints(),
            context=_make_ctx(),
        )
        with pytest.raises(ContractViolationError):
            client.request(req)

    def test_missing_process_id_raises(self):
        client = ACDSClient()
        ctx = ExecutionContext(process_id="", node_id="n", swarm_id="s")
        req = CapabilityRequest(
            capability="text.generate",
            input={"prompt": "test"},
            constraints=RequestConstraints(),
            context=ctx,
        )
        with pytest.raises(ContractViolationError):
            client.request(req)


class TestFallbackChain:
    """Fallback chain excludes already-tried providers."""

    def test_excludes_tried_providers(self):
        client = ACDSClient()
        chain = client._build_fallback_chain("text.generate", ["ollama"])
        assert "ollama" not in chain
        assert "apple_intelligence" in chain

    def test_all_excluded_returns_empty(self):
        client = ACDSClient()
        chain = client._build_fallback_chain(
            "text.generate", ["ollama", "apple_intelligence"]
        )
        assert chain == []


class TestPolicyDenial:
    """Policy denial blocks execution."""

    def test_high_sensitivity_blocks_ollama(self):
        client = ACDSClient()
        req = _make_request(sensitivity="high", local_only=False)
        # ollama lacks encryption, apple_intelligence has it
        # If both are up, apple should be selected; if only ollama, policy denied
        # Either way, ollama alone would be denied
        result = client._policy.evaluate(req, "ollama")
        assert result.allowed is False


class TestRetryIntegration:
    """Retry strategy applied on provider failure."""

    def test_retry_strategy_exists_on_client(self):
        client = ACDSClient()
        assert client._retry is not None
        assert client._retry.max_retries == 2


class TestLatencyRecording:
    """Response includes latency measurement."""

    def test_record_latency_stores_value(self):
        client = ACDSClient()
        client._record_latency("ollama", 150)
        assert client._latency_history["ollama"] == [150]

    def test_latency_history_caps_at_20(self):
        client = ACDSClient()
        for i in range(25):
            client._record_latency("ollama", i)
        assert len(client._latency_history["ollama"]) == 20


@pytest.mark.skipif(not OLLAMA_UP, reason="Ollama not available on port 11434")
class TestLiveOllamaRequest:
    """Live inference tests requiring Ollama."""

    def test_text_generate_succeeds(self):
        client = ACDSClient()
        req = _make_request(capability="text.generate", prompt="Say hello in one word")
        resp = client.request(req)
        assert resp.output
        assert resp.provider_id in ("ollama", "apple_intelligence")
        assert resp.latency_ms >= 0

    def test_response_includes_cost_estimate(self):
        client = ACDSClient()
        req = _make_request(capability="text.generate", prompt="Say yes")
        resp = client.request(req)
        assert resp.cost_estimate == 0.0

    def test_decision_trace_populated(self):
        client = ACDSClient()
        req = _make_request(capability="text.generate", prompt="Say yes")
        resp = client.request(req)
        assert resp.decision_trace.candidates_evaluated
        assert resp.decision_trace.selected_provider
        assert resp.decision_trace.selection_reason

    def test_local_only_uses_local_providers(self):
        client = ACDSClient()
        req = _make_request(local_only=True, prompt="Say yes")
        resp = client.request(req)
        assert resp.provider_id in ("ollama", "apple_intelligence")
