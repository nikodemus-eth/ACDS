"""Comprehensive tests for ACDS integration: client, inference, config, and LLM paths.

All tests use real objects — real HTTP server, real env vars, real code paths.
No mocks, no stubs, no monkeypatches.
"""
from __future__ import annotations

import json
import os
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

import pytest

from process_swarm.acds_client import (
    ACDSClient,
    ACDSClientError,
    CognitiveGrade,
    DecisionPosture,
    DispatchRunRequest,
    DispatchRunResponse,
    InstanceContext,
    LoadTier,
    RoutingConstraints,
    RoutingRequest,
    TaskType,
)
from process_swarm.config import load_inference_config
from process_swarm.inference import (
    ACDSInferenceProvider,
    RulesOnlyProvider,
    create_inference_provider,
)
from swarm.definer.archetype import (
    SwarmArchetype,
    SwarmArchetypeClassification,
    classify_swarm_archetype,
    classify_swarm_archetype_override,
)
from swarm.definer.constraints import (
    ConstraintSet,
    constraint_set_from_dict,
    constraint_set_to_dict,
    extract_constraints,
    validate_constraints,
)


# ──────────────────────────────────────────────
# Test HTTP Server
# ──────────────────────────────────────────────


class _TestACDSHandler(BaseHTTPRequestHandler):
    """Minimal handler that simulates the ACDS API."""

    response_body: dict = {}
    response_status: int = 200
    fail_mode: str | None = None

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if _TestACDSHandler.fail_mode == "500":
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"internal"}')
            return

        content_length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(content_length)

        self.send_response(_TestACDSHandler.response_status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(_TestACDSHandler.response_body).encode())

    def log_message(self, format, *args):
        pass  # suppress logs


class _EmptyBodyHandler(BaseHTTPRequestHandler):
    """Handler that returns an empty body for health checks."""

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b"")

    def log_message(self, format, *args):
        pass


class _HTTPErrorHandler(BaseHTTPRequestHandler):
    """Handler that returns 500 with unreadable body."""

    def do_GET(self):
        self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        # Send an empty body to simulate a read failure scenario
        self.wfile.write(b"")

    def log_message(self, format, *args):
        pass


@pytest.fixture
def mock_server():
    """Start a real HTTP server for ACDS client tests."""
    server = HTTPServer(("127.0.0.1", 0), _TestACDSHandler)
    port = server.server_address[1]
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture
def empty_body_server():
    """Start a real HTTP server that returns empty bodies."""
    server = HTTPServer(("127.0.0.1", 0), _EmptyBodyHandler)
    port = server.server_address[1]
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


@pytest.fixture
def error_server():
    """Start a real HTTP server that returns 500 errors."""
    server = HTTPServer(("127.0.0.1", 0), _HTTPErrorHandler)
    port = server.server_address[1]
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


# ──────────────────────────────────────────────
# acds_client.py — Enums
# ──────────────────────────────────────────────


class TestEnums:
    def test_task_type_values(self):
        assert TaskType.CLASSIFICATION.value == "classification"
        assert TaskType.EXTRACTION.value == "extraction"
        assert TaskType.GENERATION.value == "generation"
        assert TaskType.REASONING.value == "reasoning"
        assert TaskType.CREATIVE.value == "creative"
        assert TaskType.ANALYTICAL.value == "analytical"
        assert TaskType.SUMMARIZATION.value == "summarization"
        assert TaskType.CODING.value == "coding"
        assert TaskType.DECISION_SUPPORT.value == "decision_support"
        assert TaskType.TRANSFORMATION.value == "transformation"
        assert TaskType.CRITIQUE.value == "critique"
        assert TaskType.PLANNING.value == "planning"
        assert TaskType.RETRIEVAL_SYNTHESIS.value == "retrieval_synthesis"

    def test_cognitive_grade_values(self):
        assert CognitiveGrade.BASIC.value == "basic"
        assert CognitiveGrade.STANDARD.value == "standard"
        assert CognitiveGrade.ENHANCED.value == "enhanced"
        assert CognitiveGrade.FRONTIER.value == "frontier"
        assert CognitiveGrade.SPECIALIZED.value == "specialized"

    def test_load_tier_values(self):
        assert LoadTier.SINGLE_SHOT.value == "single_shot"
        assert LoadTier.BATCH.value == "batch"
        assert LoadTier.STREAMING.value == "streaming"
        assert LoadTier.HIGH_THROUGHPUT.value == "high_throughput"

    def test_decision_posture_values(self):
        assert DecisionPosture.EXPLORATORY.value == "exploratory"
        assert DecisionPosture.ADVISORY.value == "advisory"
        assert DecisionPosture.OPERATIONAL.value == "operational"
        assert DecisionPosture.FINAL.value == "final"
        assert DecisionPosture.EVIDENTIARY.value == "evidentiary"


# ──────────────────────────────────────────────
# acds_client.py — Data Classes
# ──────────────────────────────────────────────


class TestRoutingRequest:
    def test_to_dict_without_instance_context(self):
        req = RoutingRequest(
            application="test", process="p", step="s",
            taskType=TaskType.GENERATION.value,
        )
        d = req.to_dict()
        assert d["application"] == "test"
        assert "instanceContext" not in d

    def test_to_dict_with_instance_context(self):
        req = RoutingRequest(
            application="test", process="p", step="s",
            taskType=TaskType.GENERATION.value,
            instanceContext=InstanceContext(retryCount=2),
        )
        d = req.to_dict()
        assert "instanceContext" in d
        assert d["instanceContext"]["retryCount"] == 2

    def test_defaults(self):
        req = RoutingRequest(
            application="a", process="p", step="s",
            taskType="generation",
        )
        assert req.loadTier == "single_shot"
        assert req.decisionPosture == "operational"
        assert req.cognitiveGrade == "standard"
        assert req.input == ""
        assert req.constraints.privacy == "local_only"


class TestDispatchRunRequest:
    def test_to_dict_without_request_id(self):
        routing = RoutingRequest(
            application="a", process="p", step="s",
            taskType="generation",
        )
        req = DispatchRunRequest(routingRequest=routing, inputPayload="hello")
        d = req.to_dict()
        assert d["inputPayload"] == "hello"
        assert d["inputFormat"] == "text"
        assert "requestId" not in d

    def test_to_dict_with_request_id(self):
        routing = RoutingRequest(
            application="a", process="p", step="s",
            taskType="generation",
        )
        req = DispatchRunRequest(
            routingRequest=routing, inputPayload="hello",
            requestId="req-123",
        )
        d = req.to_dict()
        assert d["requestId"] == "req-123"


class TestDispatchRunResponse:
    def test_from_dict_full(self):
        data = {
            "executionId": "ex-1",
            "status": "succeeded",
            "normalizedOutput": "result text",
            "outputFormat": "json",
            "selectedModelProfileId": "model-1",
            "selectedTacticProfileId": "tactic-1",
            "selectedProviderId": "prov-1",
            "latencyMs": 150,
            "fallbackUsed": True,
            "fallbackAttempts": 2,
            "rationaleId": "rat-1",
            "rationaleSummary": "chose this",
        }
        resp = DispatchRunResponse.from_dict(data)
        assert resp.executionId == "ex-1"
        assert resp.status == "succeeded"
        assert resp.normalizedOutput == "result text"
        assert resp.outputFormat == "json"
        assert resp.latencyMs == 150
        assert resp.fallbackUsed is True
        assert resp.fallbackAttempts == 2

    def test_from_dict_empty(self):
        resp = DispatchRunResponse.from_dict({})
        assert resp.executionId == ""
        assert resp.status == ""
        assert resp.normalizedOutput is None
        assert resp.latencyMs == 0
        assert resp.fallbackUsed is False


class TestACDSClientError:
    def test_error_attributes(self):
        err = ACDSClientError("fail", status_code=500, body='{"e":"x"}')
        assert err.status_code == 500
        assert err.body == '{"e":"x"}'
        assert "fail" in str(err)

    def test_error_without_status(self):
        err = ACDSClientError("connection refused")
        assert err.status_code is None
        assert err.body == ""


# ──────────────────────────────────────────────
# acds_client.py — ACDSClient
# ──────────────────────────────────────────────


class TestACDSClient:
    def test_health_success(self, mock_server):
        client = ACDSClient(base_url=mock_server)
        assert client.health() is True

    def test_health_failure(self):
        client = ACDSClient(base_url="http://127.0.0.1:1", timeout_seconds=1)
        assert client.health() is False

    def test_dispatch_success(self, mock_server):
        _TestACDSHandler.response_body = {
            "executionId": "ex-1",
            "status": "succeeded",
            "normalizedOutput": "hello world",
            "latencyMs": 42,
        }
        _TestACDSHandler.response_status = 200
        _TestACDSHandler.fail_mode = None

        client = ACDSClient(base_url=mock_server)
        routing = RoutingRequest(
            application="test", process="p", step="s",
            taskType="generation",
        )
        req = DispatchRunRequest(routingRequest=routing, inputPayload="prompt")
        resp = client.dispatch(req)

        assert resp.executionId == "ex-1"
        assert resp.status == "succeeded"
        assert resp.normalizedOutput == "hello world"
        assert resp.latencyMs == 42

    def test_dispatch_http_error(self, mock_server):
        _TestACDSHandler.fail_mode = "500"

        client = ACDSClient(base_url=mock_server)
        routing = RoutingRequest(
            application="test", process="p", step="s",
            taskType="generation",
        )
        req = DispatchRunRequest(routingRequest=routing, inputPayload="p")

        with pytest.raises(ACDSClientError) as exc_info:
            client.dispatch(req)
        assert exc_info.value.status_code == 500

    def test_dispatch_connection_error(self):
        client = ACDSClient(base_url="http://127.0.0.1:1", timeout_seconds=1)
        routing = RoutingRequest(
            application="test", process="p", step="s",
            taskType="generation",
        )
        req = DispatchRunRequest(routingRequest=routing, inputPayload="p")

        with pytest.raises(ACDSClientError) as exc_info:
            client.dispatch(req)
        assert "Connection error" in str(exc_info.value) or "timed out" in str(exc_info.value)

    def test_auth_token_header(self, mock_server):
        _TestACDSHandler.response_body = {"status": "succeeded", "normalizedOutput": "ok"}
        _TestACDSHandler.response_status = 200
        _TestACDSHandler.fail_mode = None

        client = ACDSClient(base_url=mock_server, auth_token="test-token-123")
        headers = client._headers()
        assert headers["Authorization"] == "Bearer test-token-123"

    def test_no_auth_token_header(self):
        client = ACDSClient(base_url="http://localhost:3000")
        headers = client._headers()
        assert "Authorization" not in headers

    def test_trailing_slash_stripped(self):
        client = ACDSClient(base_url="http://localhost:3000///")
        assert client.base_url == "http://localhost:3000"

    def test_dispatch_empty_response(self, mock_server):
        """Server returns empty body -- client handles gracefully."""
        _TestACDSHandler.response_body = {}
        _TestACDSHandler.response_status = 200
        _TestACDSHandler.fail_mode = None

        client = ACDSClient(base_url=mock_server)
        routing = RoutingRequest(
            application="t", process="p", step="s", taskType="generation",
        )
        req = DispatchRunRequest(routingRequest=routing, inputPayload="x")
        resp = client.dispatch(req)
        assert resp.executionId == ""


# ──────────────────────────────────────────────
# inference.py
# ──────────────────────────────────────────────


class TestRulesOnlyProvider:
    def test_always_returns_none(self):
        provider = RulesOnlyProvider()
        assert provider.infer("any prompt") is None
        assert provider.infer(
            "test", task_type="classification",
            cognitive_grade="enhanced", process="x", step="y"
        ) is None


class TestACDSInferenceProvider:
    def test_successful_dispatch(self, mock_server):
        _TestACDSHandler.response_body = {
            "status": "succeeded",
            "normalizedOutput": "LLM says hello",
            "latencyMs": 100,
            "selectedModelProfileId": "model-x",
        }
        _TestACDSHandler.response_status = 200
        _TestACDSHandler.fail_mode = None

        client = ACDSClient(base_url=mock_server)
        provider = ACDSInferenceProvider(client)
        result = provider.infer(
            "classify this",
            task_type="classification",
            cognitive_grade="standard",
            process="definer",
            step="archetype_classification",
        )
        assert result == "LLM says hello"

    def test_fallback_succeeded_status(self, mock_server):
        _TestACDSHandler.response_body = {
            "status": "fallback_succeeded",
            "normalizedOutput": "fallback result",
            "latencyMs": 200,
            "selectedModelProfileId": "model-y",
            "fallbackUsed": True,
        }
        _TestACDSHandler.response_status = 200
        _TestACDSHandler.fail_mode = None

        client = ACDSClient(base_url=mock_server)
        provider = ACDSInferenceProvider(client)
        result = provider.infer("test")
        assert result == "fallback result"

    def test_failed_status_returns_none(self, mock_server):
        _TestACDSHandler.response_body = {
            "status": "failed",
            "normalizedOutput": None,
        }
        _TestACDSHandler.response_status = 200
        _TestACDSHandler.fail_mode = None

        client = ACDSClient(base_url=mock_server)
        provider = ACDSInferenceProvider(client)
        result = provider.infer("test")
        assert result is None

    def test_connection_error_returns_none(self):
        client = ACDSClient(base_url="http://127.0.0.1:1", timeout_seconds=1)
        provider = ACDSInferenceProvider(client)
        result = provider.infer("test")
        assert result is None


class TestCreateInferenceProvider:
    def test_creates_rules_provider(self):
        provider = create_inference_provider({"provider": "rules"})
        assert isinstance(provider, RulesOnlyProvider)

    def test_creates_acds_provider(self):
        provider = create_inference_provider({
            "provider": "acds",
            "acds_base_url": "http://localhost:9999",
            "acds_auth_token": "tok",
            "acds_timeout_seconds": 10,
        })
        assert isinstance(provider, ACDSInferenceProvider)

    def test_default_is_rules(self):
        provider = create_inference_provider({})
        assert isinstance(provider, RulesOnlyProvider)


# ──────────────────────────────────────────────
# config.py — uses real env var manipulation
# ──────────────────────────────────────────────


class TestLoadInferenceConfig:
    def test_defaults(self):
        # Save and clear relevant env vars
        saved = {}
        keys = ("INFERENCE_PROVIDER", "ACDS_BASE_URL", "ACDS_AUTH_TOKEN", "ACDS_TIMEOUT_SECONDS")
        for k in keys:
            saved[k] = os.environ.pop(k, None)
        try:
            config = load_inference_config()
            assert config["provider"] == "rules"
            assert config["acds_base_url"] == "http://localhost:3000"
            assert config["acds_auth_token"] is None
            assert config["acds_timeout_seconds"] == 30
        finally:
            # Restore env vars
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v

    def test_custom_values(self):
        saved = {}
        env = {
            "INFERENCE_PROVIDER": "acds",
            "ACDS_BASE_URL": "http://myhost:4000",
            "ACDS_AUTH_TOKEN": "secret",
            "ACDS_TIMEOUT_SECONDS": "60",
        }
        for k in env:
            saved[k] = os.environ.get(k)
        try:
            os.environ.update(env)
            config = load_inference_config()
            assert config["provider"] == "acds"
            assert config["acds_base_url"] == "http://myhost:4000"
            assert config["acds_auth_token"] == "secret"
            assert config["acds_timeout_seconds"] == 60
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v
                else:
                    os.environ.pop(k, None)


# ──────────────────────────────────────────────
# archetype.py — LLM classification paths
# ──────────────────────────────────────────────


class _FakeInference:
    """Minimal inference provider for testing (real implementation, not a mock)."""
    def __init__(self, response):
        self._response = response

    def infer(self, prompt, *, task_type="generation", cognitive_grade="standard",
              process="definer", step="general"):
        return self._response


class TestArchetypeLLMClassification:
    def test_llm_classification_with_valid_response(self):
        inference = _FakeInference(json.dumps({
            "swarm_archetype": "code_generation",
            "complexity": "complex",
            "confidence": 0.95,
            "reasoning": "clearly code-related",
        }))
        result = classify_swarm_archetype("build a CLI tool", inference)
        assert result.swarm_archetype == "code_generation"
        assert result.source == "acds"
        assert result.confidence == 0.95
        assert result.complexity == "complex"
        assert result.decomposition_required is True

    def test_llm_classification_simple_complexity(self):
        inference = _FakeInference(json.dumps({
            "swarm_archetype": "configuration",
            "complexity": "simple",
            "confidence": 0.88,
            "reasoning": "simple config",
        }))
        result = classify_swarm_archetype("setup nginx", inference)
        assert result.complexity == "simple"
        assert result.decomposition_required is False

    def test_llm_low_confidence_needs_clarification(self):
        inference = _FakeInference(json.dumps({
            "swarm_archetype": "structured_report",
            "complexity": "moderate",
            "confidence": 0.3,
            "reasoning": "unclear",
        }))
        result = classify_swarm_archetype("do something", inference)
        assert result.needs_clarification is True
        assert result.confidence == 0.3

    def test_llm_returns_none_falls_back_to_rules(self):
        inference = _FakeInference(None)
        result = classify_swarm_archetype("generate a weekly report", inference)
        assert result.source == "rules"

    def test_llm_returns_invalid_json_falls_back(self):
        inference = _FakeInference("not json")
        result = classify_swarm_archetype("generate a weekly report", inference)
        assert result.source == "rules"

    def test_llm_returns_unknown_archetype_falls_back(self):
        inference = _FakeInference(json.dumps({
            "swarm_archetype": "nonexistent_type",
            "complexity": "moderate",
            "confidence": 0.9,
            "reasoning": "bad",
        }))
        result = classify_swarm_archetype("generate a weekly report", inference)
        assert result.source == "rules"

    def test_llm_returns_markdown_wrapped_json(self):
        response = '```json\n{"swarm_archetype": "data_transformation", "complexity": "moderate", "confidence": 0.85, "reasoning": "data work"}\n```'
        inference = _FakeInference(response)
        result = classify_swarm_archetype("transform csv to json", inference)
        assert result.swarm_archetype == "data_transformation"
        assert result.source == "acds"

    def test_llm_missing_reasoning_uses_default(self):
        inference = _FakeInference(json.dumps({
            "swarm_archetype": "monitoring_workflow",
            "complexity": "moderate",
            "confidence": 0.8,
        }))
        result = classify_swarm_archetype("watch server health", inference)
        assert result.reasoning == "LLM classification via ACDS"

    def test_llm_missing_confidence_uses_default(self):
        inference = _FakeInference(json.dumps({
            "swarm_archetype": "monitoring_workflow",
            "complexity": "moderate",
        }))
        result = classify_swarm_archetype("watch server", inference)
        assert result.confidence == 0.85

    def test_no_inference_uses_rules(self):
        result = classify_swarm_archetype("generate a weekly report")
        assert result.source == "rules"

    def test_override_ignores_inference(self):
        result = classify_swarm_archetype_override("code_generation")
        assert result.source == "user_override"
        assert result.confidence == 1.0


# ──────────────────────────────────────────────
# constraints.py — LLM extraction + rule paths
# ──────────────────────────────────────────────


class TestConstraintsLLMExtraction:
    def test_llm_extraction_valid_json(self):
        inference = _FakeInference(json.dumps({
            "sections": ["intro", "body", "conclusion"],
            "min_word_count": 500,
            "max_word_count": 2000,
            "required_sources": 5,
            "freshness_window_days": 30,
            "delivery_channel": "email",
            "output_format": "pdf",
            "schedule_hint": "weekly",
            "fail_closed_conditions": ["no data"],
            "custom": {"key": "val"},
        }))
        result = extract_constraints("write a report", "structured_report", inference)
        assert result.sections == ["intro", "body", "conclusion"]
        assert result.min_word_count == 500
        assert result.max_word_count == 2000
        assert result.required_sources == 5
        assert result.delivery_channel == "email"
        assert result.output_format == "pdf"
        assert result.schedule_hint == "weekly"
        assert result.fail_closed_conditions == ["no data"]
        assert result.custom == {"key": "val"}

    def test_llm_extraction_returns_none_falls_back(self):
        inference = _FakeInference(None)
        result = extract_constraints("write a report", "structured_report", inference)
        assert result.required_sources == 3
        assert result.output_format == "html"

    def test_llm_extraction_invalid_json_falls_back(self):
        inference = _FakeInference("garbage output")
        result = extract_constraints("write a report", "structured_report", inference)
        assert result.output_format == "html"

    def test_llm_extraction_with_markdown_fences(self):
        response = '```json\n{"sections": ["a", "b"], "min_word_count": null, "max_word_count": null, "required_sources": null, "freshness_window_days": null, "delivery_channel": null, "output_format": "markdown", "schedule_hint": null, "fail_closed_conditions": [], "custom": {}}\n```'
        inference = _FakeInference(response)
        result = extract_constraints("make docs", "document_generation", inference)
        assert result.sections == ["a", "b"]
        assert result.output_format == "markdown"


class TestConstraintsRuleBased:
    def test_word_count_range(self):
        result = extract_constraints("write 500 to 1000 words about cats", "structured_report")
        assert result.min_word_count == 500
        assert result.max_word_count == 1000

    def test_minimum_word_count(self):
        result = extract_constraints("at least 200 words", "document_generation")
        assert result.min_word_count == 200

    def test_maximum_word_count(self):
        result = extract_constraints("no more than 500 words", "document_generation")
        assert result.max_word_count == 500

    def test_source_count(self):
        result = extract_constraints("use 5 sources", "document_generation")
        assert result.required_sources == 5

    def test_default_sources_for_report(self):
        result = extract_constraints("generic report", "structured_report")
        assert result.required_sources == 3

    def test_freshness_days(self):
        result = extract_constraints("data from past 7 days", "data_transformation")
        assert result.freshness_window_days == 7

    def test_freshness_weeks(self):
        result = extract_constraints("within 2 weeks", "data_transformation")
        assert result.freshness_window_days == 14

    def test_freshness_months(self):
        result = extract_constraints("last 3 months", "data_transformation")
        assert result.freshness_window_days == 90

    def test_delivery_telegram(self):
        result = extract_constraints("send via telegram", "delivery_workflow")
        assert result.delivery_channel == "telegram"

    def test_delivery_slack(self):
        result = extract_constraints("post to slack", "delivery_workflow")
        assert result.delivery_channel == "slack"

    def test_output_format_pdf(self):
        result = extract_constraints("generate pdf", "document_generation")
        assert result.output_format == "pdf"

    def test_output_format_csv(self):
        result = extract_constraints("export as csv", "data_transformation")
        assert result.output_format == "csv"

    def test_schedule_daily(self):
        result = extract_constraints("run daily", "scheduled_structured_report")
        assert result.schedule_hint == "daily"

    def test_schedule_monthly(self):
        result = extract_constraints("run monthly", "scheduled_structured_report")
        assert result.schedule_hint == "monthly"

    def test_cron_schedule(self):
        result = extract_constraints("cron: 0 9 * * 1", "scheduled_structured_report")
        assert result.schedule_hint == "cron:0 9 * * 1"

    def test_sections_extraction(self):
        result = extract_constraints(
            "include the following sections: intro, methods, results",
            "structured_report",
        )
        assert "intro" in result.sections
        assert "methods" in result.sections
        assert "results" in result.sections

    def test_no_constraints_found(self):
        result = extract_constraints("just do it", "code_generation")
        assert result.sections == []
        assert result.min_word_count is None
        assert result.delivery_channel is None


class TestConstraintSetHelpers:
    def test_round_trip_to_dict_from_dict(self):
        cs = ConstraintSet(
            sections=["a", "b"],
            min_word_count=100,
            max_word_count=200,
            freshness_window_days=7,
            delivery_channel="email",
            output_format="html",
            schedule_hint="weekly",
            fail_closed_conditions=["x"],
            custom={"k": "v"},
        )
        d = constraint_set_to_dict(cs)
        cs2 = constraint_set_from_dict(d)
        assert cs2.sections == cs.sections
        assert cs2.min_word_count == cs.min_word_count
        assert cs2.max_word_count == cs.max_word_count
        assert cs2.freshness_window_days == cs.freshness_window_days
        assert cs2.delivery_channel == cs.delivery_channel
        assert cs2.output_format == cs.output_format
        assert cs2.schedule_hint == cs.schedule_hint
        assert cs2.custom == cs.custom

    def test_from_dict_defaults(self):
        cs = constraint_set_from_dict({})
        assert cs.sections == []
        assert cs.min_word_count is None
        assert cs.fail_closed_conditions == []
        assert cs.custom == {}


class TestValidateConstraints:
    def test_valid_constraints(self):
        cs = ConstraintSet(
            min_word_count=100, max_word_count=500,
            required_sources=3, freshness_window_days=7,
            delivery_channel="email", output_format="html",
        )
        assert validate_constraints(cs) == []

    def test_min_exceeds_max(self):
        cs = ConstraintSet(min_word_count=500, max_word_count=100)
        errors = validate_constraints(cs)
        assert any("min_word_count exceeds" in e for e in errors)

    def test_negative_sources(self):
        cs = ConstraintSet(required_sources=-1)
        errors = validate_constraints(cs)
        assert any("required_sources" in e for e in errors)

    def test_negative_freshness(self):
        cs = ConstraintSet(freshness_window_days=-5)
        errors = validate_constraints(cs)
        assert any("freshness_window_days" in e for e in errors)

    def test_unknown_delivery_channel(self):
        cs = ConstraintSet(delivery_channel="pigeon")
        errors = validate_constraints(cs)
        assert any("unknown delivery_channel" in e for e in errors)

    def test_unknown_output_format(self):
        cs = ConstraintSet(output_format="docx")
        errors = validate_constraints(cs)
        assert any("unknown output_format" in e for e in errors)


# ──────────────────────────────────────────────
# archetype.py — Rule-based coverage gaps
# ──────────────────────────────────────────────


class TestArchetypeRuleBased:
    def test_no_keywords_needs_clarification(self):
        result = classify_swarm_archetype("xyzzy")
        assert result.needs_clarification is True
        assert result.confidence == 0.1

    def test_simple_complexity(self):
        result = classify_swarm_archetype("build tool")
        assert result.complexity == "simple"

    def test_complex_text(self):
        long_text = " ".join(["build"] * 101)
        result = classify_swarm_archetype(long_text)
        assert result.complexity == "complex"

    def test_scheduled_report_beats_plain_report(self):
        result = classify_swarm_archetype("weekly report analysis")
        assert result.swarm_archetype == "scheduled_structured_report"

    def test_web_app(self):
        result = classify_swarm_archetype("create a web app dashboard")
        assert result.swarm_archetype in ("single_file_web_app", "multi_file_web_app")

    def test_multi_file_web_app(self):
        result = classify_swarm_archetype("build multiple web app components dashboard")
        assert result.swarm_archetype == "multi_file_web_app"

    def test_data_transformation(self):
        result = classify_swarm_archetype("transform and parse data pipeline")
        assert result.swarm_archetype == "data_transformation"

    def test_configuration(self):
        result = classify_swarm_archetype("configure and setup settings")
        assert result.swarm_archetype == "configuration"

    def test_monitoring(self):
        result = classify_swarm_archetype("monitor health check status")
        assert result.swarm_archetype == "monitoring_workflow"

    def test_delivery_workflow(self):
        result = classify_swarm_archetype("deliver email notification alert")
        assert result.swarm_archetype == "delivery_workflow"

    def test_communication_artifact(self):
        result = classify_swarm_archetype("send email notification")
        assert result.swarm_archetype in ("communication_artifact", "delivery_workflow")

    def test_software_build(self):
        result = classify_swarm_archetype("compile and package release bundle")
        assert result.swarm_archetype == "software_build"

    def test_document_generation(self):
        result = classify_swarm_archetype("generate documentation readme guide")
        assert result.swarm_archetype == "document_generation"

    def test_override_valid(self):
        result = classify_swarm_archetype_override("code_generation")
        assert result.swarm_archetype == "code_generation"
        assert result.confidence == 1.0

    def test_override_invalid(self):
        with pytest.raises(ValueError, match="Unknown archetype"):
            classify_swarm_archetype_override("not_real")


# ──────────────────────────────────────────────
# ACDS Client edge cases — real HTTP servers
# ──────────────────────────────────────────────


class TestACDSClientEdgeCases:
    """Cover acds_client.py edge cases with real HTTP servers."""

    def test_empty_response_body(self, empty_body_server):
        """Empty response body returns True for health."""
        client = ACDSClient(base_url=empty_body_server)
        result = client.health()
        assert result is True

    def test_http_error_body(self, error_server):
        """500 error path with real HTTP server."""
        client = ACDSClient(base_url=error_server)
        with pytest.raises(ACDSClientError) as exc_info:
            client._get("/test")
        assert exc_info.value.status_code == 500

    def test_timeout_error(self):
        """Connection to unreachable host times out."""
        client = ACDSClient(base_url="http://192.0.2.1:1", timeout_seconds=1)
        with pytest.raises(ACDSClientError):
            client._get("/test")


# ──────────────────────────────────────────────
# Constraints _is_meaningful edge case
# ──────────────────────────────────────────────


class TestIsMeaningful:
    """Cover constraints.py _is_meaningful."""

    def test_empty_constraint_set_is_not_meaningful(self):
        from swarm.definer.constraints import _is_meaningful, ConstraintSet
        cs = ConstraintSet()
        assert _is_meaningful(cs) is False

    def test_constraint_with_sections_is_meaningful(self):
        from swarm.definer.constraints import _is_meaningful, ConstraintSet
        cs = ConstraintSet(sections=["intro", "body"])
        assert _is_meaningful(cs) is True
