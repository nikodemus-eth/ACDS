"""GRITS tests for node type definitions.

Tests NodeType enum, config defaults, and schema structure.
NO mocks, NO stubs, NO monkeypatches.
"""

from __future__ import annotations

from swarm.integration.contracts import RequestConstraints
from swarm.integration.node_schemas import (
    AggregationNodeConfig,
    CognitiveNodeConfig,
    ControlNodeConfig,
    NodeType,
    PolicyNodeConfig,
)


class TestNodeTypeEnum:
    """NodeType enum has all 5 values."""

    def test_has_cognitive(self):
        assert NodeType.COGNITIVE.value == "cognitive"

    def test_has_control(self):
        assert NodeType.CONTROL.value == "control"

    def test_has_tool(self):
        assert NodeType.TOOL.value == "tool"

    def test_has_policy(self):
        assert NodeType.POLICY.value == "policy"

    def test_has_aggregation(self):
        assert NodeType.AGGREGATION.value == "aggregation"

    def test_exactly_five_members(self):
        assert len(NodeType) == 5

    def test_string_enum(self):
        assert isinstance(NodeType.COGNITIVE, str)


class TestCognitiveNodeConfig:
    """CognitiveNodeConfig defaults: retry_on_failure=True, max_retries=2."""

    def test_retry_on_failure_default_true(self):
        cfg = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(),
        )
        assert cfg.retry_on_failure is True

    def test_max_retries_default_two(self):
        cfg = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(),
        )
        assert cfg.max_retries == 2

    def test_output_artifact_type_default_none(self):
        cfg = CognitiveNodeConfig(
            capability="text.generate",
            constraints=RequestConstraints(),
        )
        assert cfg.output_artifact_type is None


class TestControlNodeConfig:
    """ControlNodeConfig has branches dict."""

    def test_branches_default_empty(self):
        cfg = ControlNodeConfig()
        assert cfg.branches == {}

    def test_capability_default_classify(self):
        cfg = ControlNodeConfig()
        assert cfg.capability == "text.classify"

    def test_branches_accept_mapping(self):
        cfg = ControlNodeConfig(branches={"yes": "node_a", "no": "node_b"})
        assert cfg.branches["yes"] == "node_a"
        assert cfg.branches["no"] == "node_b"


class TestPolicyNodeConfig:
    """PolicyNodeConfig block_on_deny defaults to True."""

    def test_block_on_deny_default_true(self):
        cfg = PolicyNodeConfig()
        assert cfg.block_on_deny is True

    def test_policy_capability_default(self):
        cfg = PolicyNodeConfig()
        assert cfg.policy_capability == "policy.evaluate"


class TestAggregationNodeConfig:
    """AggregationNodeConfig merge strategies."""

    def test_merge_strategy_default_concatenate(self):
        cfg = AggregationNodeConfig()
        assert cfg.merge_strategy == "concatenate"

    def test_source_nodes_default_empty(self):
        cfg = AggregationNodeConfig()
        assert cfg.source_nodes == []

    def test_accepts_source_nodes(self):
        cfg = AggregationNodeConfig(source_nodes=["a", "b", "c"])
        assert len(cfg.source_nodes) == 3

    def test_accepts_structured_strategy(self):
        cfg = AggregationNodeConfig(merge_strategy="structured")
        assert cfg.merge_strategy == "structured"
