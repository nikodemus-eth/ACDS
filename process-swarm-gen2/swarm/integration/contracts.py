"""Integration boundary contracts between Process Swarm and ACDS.

CapabilityRequest: outbound request from a swarm node to ACDS
CapabilityResponse: structured response returned by ACDS
DecisionTrace: transparency record of provider selection
RequestConstraints: policy and performance constraints on a request
ExecutionContext: swarm-side identifiers for tracing
IntegrationError: structured error payload for failed requests
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _short_id() -> str:
    """Generate a 12-char hex identifier."""
    return uuid.uuid4().hex[:12]


def _now_utc() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Constraints & Context
# ---------------------------------------------------------------------------

@dataclass
class RequestConstraints:
    """Policy and performance constraints on a capability request."""

    local_only: bool = True
    max_latency_ms: int | None = None
    max_cost: float | None = None
    sensitivity: str = "medium"  # low / medium / high
    preferred_provider: str | None = None


@dataclass
class ExecutionContext:
    """Swarm-side identifiers attached to every capability request."""

    process_id: str          # swarm run_id
    node_id: str             # action step identifier
    swarm_id: str
    correlation_id: str = field(default_factory=_short_id)


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------

@dataclass
class CapabilityRequest:
    """Outbound request from a swarm node to the ACDS capability layer.

    Examples of ``capability`` values:
        text.generate, text.summarize, text.classify,
        speech.transcribe, policy.evaluate
    """

    capability: str
    input: dict
    constraints: RequestConstraints
    context: ExecutionContext
    request_id: str = field(default_factory=_short_id)


@dataclass
class DecisionTrace:
    """Transparency record of how the ACDS router selected a provider."""

    candidates_evaluated: list[str] = field(default_factory=list)
    selected_provider: str = ""
    selection_reason: str = ""
    policy_checks: list[str] = field(default_factory=list)
    fallback_chain: list[str] = field(default_factory=list)
    timestamp: str = field(default_factory=_now_utc)


@dataclass
class CapabilityResponse:
    """Structured response returned by ACDS after capability dispatch."""

    output: dict
    provider_id: str
    method_id: str | None
    latency_ms: int
    cost_estimate: float
    decision_trace: DecisionTrace
    fallback_used: bool
    request_id: str


# ---------------------------------------------------------------------------
# Error payload
# ---------------------------------------------------------------------------

@dataclass
class IntegrationError:
    """Structured error payload for a failed capability request.

    Error codes:
        CAPABILITY_UNAVAILABLE, POLICY_DENIED, PROVIDER_FAILED,
        FALLBACK_EXHAUSTED, CONTRACT_VIOLATION
    """

    error_code: str
    message: str
    request_id: str
    provider_attempted: str | None = None
    fallback_exhausted: bool = False
    retry_eligible: bool = False
