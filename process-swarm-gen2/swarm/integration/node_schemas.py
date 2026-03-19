"""Node type definitions for ACDS-integrated swarm graphs.

Extends the existing swarm_actions model with node types that route
through the ACDS capability dispatch layer.

NodeType: discriminator enum for graph nodes
CognitiveNodeConfig: calls ACDS for inference
ControlNodeConfig: lightweight routing decisions via ACDS SLM
PolicyNodeConfig: policy evaluation via ACDS
AggregationNodeConfig: combines outputs from prior nodes
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from swarm.integration.contracts import RequestConstraints


class NodeType(str, Enum):
    """Discriminator for swarm graph node types."""

    COGNITIVE = "cognitive"        # Calls ACDS for inference
    CONTROL = "control"            # Lightweight routing decisions via ACDS SLM
    TOOL = "tool"                  # Non-LLM tool execution (existing adapters)
    POLICY = "policy"              # Policy evaluation via ACDS
    AGGREGATION = "aggregation"    # Combines outputs from prior nodes


@dataclass
class CognitiveNodeConfig:
    """Configuration for a node that calls ACDS for inference.

    Wraps a capability request with retry and artifact metadata.
    """

    capability: str
    constraints: RequestConstraints
    output_artifact_type: str | None = None
    retry_on_failure: bool = True
    max_retries: int = 2


@dataclass
class ControlNodeConfig:
    """Configuration for a lightweight routing/classification node.

    Uses ACDS SLM to classify input and branch execution
    to the appropriate downstream node.
    """

    capability: str = "text.classify"
    decision_field: str = "classification"
    branches: dict[str, str] = field(default_factory=dict)  # decision_value -> next_node_id


@dataclass
class PolicyNodeConfig:
    """Configuration for a policy evaluation node.

    Calls ACDS policy.evaluate and optionally blocks the graph
    on a deny verdict.
    """

    policy_capability: str = "policy.evaluate"
    policy_id: str = ""
    block_on_deny: bool = True


@dataclass
class AggregationNodeConfig:
    """Configuration for a node that merges outputs from upstream nodes.

    Merge strategies:
        concatenate: join text outputs sequentially
        structured: merge dicts with key dedup
        summary: call ACDS to produce a summarized merge
    """

    source_nodes: list[str] = field(default_factory=list)
    merge_strategy: str = "concatenate"  # concatenate / structured / summary
