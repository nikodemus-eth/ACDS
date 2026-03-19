"""GRITS tests for the execution pipeline.

Tests cognitive, control, policy, and aggregation nodes through the
full pipeline with real ACDS client. NO mocks, NO stubs, NO monkeypatches.

Live inference tests are skipped when services are unavailable.
"""

from __future__ import annotations

import json
import socket
from pathlib import Path

import pytest

from swarm.integration.acds_client import ACDSClient
from swarm.integration.contracts import ExecutionContext, RequestConstraints
from swarm.integration.execution_pipeline import IntegrationPipeline, NodeResult
from swarm.integration.node_schemas import (
    AggregationNodeConfig,
    CognitiveNodeConfig,
    ControlNodeConfig,
    PolicyNodeConfig,
)


def _port_open(port: int) -> bool:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        result = s.connect_ex(("localhost", port))
        s.close()
        return result == 0
    except Exception:
        return False


INFERENCE_UP = _port_open(11434) or _port_open(11435)


def _make_ctx(process_id: str = "test-proc", node_id: str = "test-node") -> ExecutionContext:
    return ExecutionContext(process_id=process_id, node_id=node_id, swarm_id="test-swarm")


class TestAggregationNode:
    """Aggregation node combines prior results without inference."""

    def test_concatenate_strategy(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)

        config = AggregationNodeConfig(
            source_nodes=["node_a", "node_b"],
            merge_strategy="concatenate",
        )
        prior = {
            "node_a": {"text": "first result"},
            "node_b": {"text": "second result"},
        }
        result = pipeline.execute_aggregation_node(config, prior)
        assert "first result" in result["text"]
        assert "second result" in result["text"]
        assert result["source_count"] == 2

    def test_structured_strategy(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)

        config = AggregationNodeConfig(
            source_nodes=["node_a", "node_b"],
            merge_strategy="structured",
        )
        prior = {
            "node_a": {"key1": "val1"},
            "node_b": {"key2": "val2"},
        }
        result = pipeline.execute_aggregation_node(config, prior)
        assert result["key1"] == "val1"
        assert result["key2"] == "val2"

    def test_structured_dedup(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)

        config = AggregationNodeConfig(
            source_nodes=["a", "b"],
            merge_strategy="structured",
        )
        prior = {
            "a": {"shared": "from_a"},
            "b": {"shared": "from_b"},
        }
        result = pipeline.execute_aggregation_node(config, prior)
        # Duplicates collected into list
        assert isinstance(result["shared"], list)
        assert "from_a" in result["shared"]
        assert "from_b" in result["shared"]

    def test_summary_strategy_returns_sources(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)

        config = AggregationNodeConfig(
            source_nodes=["x"],
            merge_strategy="summary",
        )
        prior = {"x": {"text": "data"}}
        result = pipeline.execute_aggregation_node(config, prior)
        assert "sources" in result
        assert result["strategy"] == "summary"

    def test_missing_source_node_ignored(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)

        config = AggregationNodeConfig(
            source_nodes=["exists", "missing"],
            merge_strategy="concatenate",
        )
        prior = {"exists": {"text": "only one"}}
        result = pipeline.execute_aggregation_node(config, prior)
        assert result["source_count"] == 1


class TestPipelineWorkspace:
    """Pipeline respects workspace isolation."""

    def test_pipeline_uses_provided_workspace(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        assert pipeline._workspace == tmp_path

    def test_lineage_tracker_created(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        assert pipeline.lineage is not None


@pytest.mark.skipif(not INFERENCE_UP, reason="No inference service on 11434 or 11435")
class TestLiveCognitiveNode:
    """Cognitive node produces artifact in workspace with live inference."""

    def test_cognitive_node_produces_output(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(local_only=True),
            output_artifact_type="generation",
        )
        ctx = _make_ctx()
        result = pipeline.execute_cognitive_node(
            config, {"prompt": "Say hello in one word"}, ctx,
        )
        assert result.success is True
        assert result.output

    def test_cognitive_node_writes_artifact(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(local_only=True),
            output_artifact_type="generation",
        )
        ctx = _make_ctx()
        result = pipeline.execute_cognitive_node(
            config, {"prompt": "Say yes"}, ctx,
        )
        assert result.artifacts
        artifact_path = Path(result.artifacts[0])
        assert artifact_path.exists()
        content = json.loads(artifact_path.read_text())
        assert "text" in content

    def test_lineage_entry_created(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(local_only=True),
        )
        ctx = _make_ctx(process_id="lineage-test")
        pipeline.execute_cognitive_node(
            config, {"prompt": "test"}, ctx,
        )
        chain = pipeline.lineage.get_chain("lineage-test")
        assert len(chain) == 1
        assert chain[0].node_type == "cognitive"

    def test_decision_trace_linked_to_lineage(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(local_only=True),
        )
        ctx = _make_ctx(process_id="trace-link")
        pipeline.execute_cognitive_node(
            config, {"prompt": "test"}, ctx,
        )
        chain = pipeline.lineage.get_chain("trace-link")
        assert chain[0].decision_trace is not None
        assert "selected" in chain[0].decision_trace


@pytest.mark.skipif(not INFERENCE_UP, reason="No inference service on 11434 or 11435")
class TestLiveControlNode:
    """Control node returns branch decision."""

    def test_control_node_returns_string(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = ControlNodeConfig(
            branches={"yes": "approve_node", "no": "reject_node"},
        )
        ctx = _make_ctx()
        branch = pipeline.execute_control_node(
            config, {"prompt": "Classify: is 2+2=4? Answer yes or no"}, ctx,
        )
        assert isinstance(branch, str)


@pytest.mark.skipif(not INFERENCE_UP, reason="No inference service on 11434 or 11435")
class TestLivePolicyNode:
    """Policy node returns boolean."""

    def test_policy_node_returns_bool(self, tmp_path):
        acds = ACDSClient()
        pipeline = IntegrationPipeline(acds, tmp_path)
        config = PolicyNodeConfig()
        ctx = _make_ctx()
        result = pipeline.execute_policy_node(
            config, {"prompt": "Is this safe? Answer: allow"}, ctx,
        )
        assert isinstance(result, bool)
