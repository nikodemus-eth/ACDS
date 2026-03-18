"""Data models for the ARGUS-Hold Layer.

CommandEnvelope: immutable request wrapping a command invocation
StageResult: outcome of a single pipeline stage
PolicyDecision: policy engine verdict for an envelope
ScopeCheck: filesystem / network scope validation result
ExecutionPlan: fully resolved plan ready for adapter dispatch
CommandResult: structured output after command execution
LedgerEntry: append-only audit record with hash chain
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def new_id(prefix: str) -> str:
    """Generate a short prefixed identifier."""
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def now_utc() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SideEffectLevel(Enum):
    """Graduated scale of command side-effect severity."""

    READ_ONLY = "read_only"
    CONTROLLED_GENERATION = "controlled_generation"
    LOCAL_MUTATION = "local_mutation"
    EXTERNAL_ACTION = "external_action"
    PRIVILEGED = "privileged"


class StageVerdict(Enum):
    """Outcome of a single pipeline stage."""

    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class CommandEnvelope:
    """Immutable request envelope wrapping a single command invocation."""

    envelope_id: str
    command_name: str
    version: str
    parameters: dict[str, Any]
    side_effect_level: SideEffectLevel
    run_id: str
    swarm_id: str
    created_at: str
    dry_run: bool = False
    metadata: dict = field(default_factory=dict)
    source_action: dict = field(default_factory=dict)


@dataclass
class StageResult:
    """Outcome of a single pipeline stage execution."""

    stage_name: str
    verdict: StageVerdict
    duration_ms: int
    details: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class PolicyDecision:
    """Verdict produced by the policy engine for a command envelope."""

    allowed: bool
    decision: str  # allow | deny | simulate_only | require_approval | require_scope_narrowing
    reason: str
    matched_rule: str
    constraints: dict = field(default_factory=dict)


@dataclass
class ScopeCheck:
    """Result of filesystem and network scope validation."""

    in_scope: bool
    checked_paths: list[str] = field(default_factory=list)
    checked_hosts: list[str] = field(default_factory=list)
    violations: list[str] = field(default_factory=list)


@dataclass
class ExecutionPlan:
    """Fully resolved plan ready for adapter dispatch."""

    plan_id: str
    envelope: CommandEnvelope
    policy_decision: PolicyDecision
    scope_check: ScopeCheck
    adapter_name: str
    timeout_ms: int
    expected_artifacts: list[str] = field(default_factory=list)
    dry_run_result: dict | None = None


@dataclass
class CommandResult:
    """Structured output produced after command execution."""

    result_id: str
    plan_id: str
    envelope_id: str
    success: bool
    output_data: dict
    artifacts_produced: list[str]
    error: str | None
    stage_results: list[StageResult]
    total_duration_ms: int
    metadata: dict = field(default_factory=dict)


@dataclass
class LedgerEntry:
    """Append-only audit record with hash-chain integrity."""

    entry_id: str
    sequence_number: int
    timestamp: str
    run_id: str
    envelope_id: str
    command_name: str
    stage_summary: dict  # {stage_name: verdict_str}
    outcome: str  # executed | denied | dry_run | error | stub_not_implemented
    content_hash: str
    prev_hash: str
    chain_hash: str
