"""ACDS + Process Swarm integration contracts, node schemas, and execution.

Provides the boundary types that connect Process Swarm orchestration
to the ACDS capability dispatch system, plus the client adapter,
execution pipeline, lineage tracking, and retry strategies.
"""

from swarm.integration.contracts import (
    CapabilityRequest,
    CapabilityResponse,
    DecisionTrace,
    ExecutionContext,
    IntegrationError as IntegrationErrorData,
    RequestConstraints,
)
from swarm.integration.errors import (
    CapabilityUnavailableError,
    ContractViolationError,
    FallbackExhaustedError,
    IntegrationError,
    PolicyDeniedError,
    ProviderFailedError,
)
from swarm.integration.node_schemas import (
    AggregationNodeConfig,
    CognitiveNodeConfig,
    ControlNodeConfig,
    NodeType,
    PolicyNodeConfig,
)
from swarm.integration.acds_client import ACDSClient
from swarm.integration.execution_pipeline import IntegrationPipeline, NodeResult
from swarm.integration.lineage import LineageEntry, LineageTracker
from swarm.integration.policy import DefaultPolicy, PolicyResult
from swarm.integration.retry import FailurePropagator, RetryStrategy

__all__ = [
    # Contracts
    "CapabilityRequest",
    "CapabilityResponse",
    "DecisionTrace",
    "ExecutionContext",
    "IntegrationErrorData",
    "RequestConstraints",
    # Node schemas
    "AggregationNodeConfig",
    "CognitiveNodeConfig",
    "ControlNodeConfig",
    "NodeType",
    "PolicyNodeConfig",
    # Errors
    "CapabilityUnavailableError",
    "ContractViolationError",
    "FallbackExhaustedError",
    "IntegrationError",
    "PolicyDeniedError",
    "ProviderFailedError",
    # Client & pipeline
    "ACDSClient",
    "IntegrationPipeline",
    "NodeResult",
    # Lineage
    "LineageEntry",
    "LineageTracker",
    # Policy
    "DefaultPolicy",
    "PolicyResult",
    # Retry
    "FailurePropagator",
    "RetryStrategy",
]
