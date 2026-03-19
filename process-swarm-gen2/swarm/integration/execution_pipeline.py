"""Orchestrated execution pipeline wiring swarm nodes to ACDS.

Handles the full lifecycle: node config -> capability request ->
ACDS execution -> artifact generation -> lineage recording.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from swarm.integration.acds_client import ACDSClient
from swarm.integration.contracts import (
    CapabilityRequest,
    CapabilityResponse,
    ExecutionContext,
    RequestConstraints,
    _short_id,
)
from swarm.integration.errors import IntegrationError
from swarm.integration.lineage import LineageEntry, LineageTracker
from swarm.integration.node_schemas import (
    AggregationNodeConfig,
    CognitiveNodeConfig,
    ControlNodeConfig,
    PolicyNodeConfig,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Node result
# ---------------------------------------------------------------------------

@dataclass
class NodeResult:
    """Outcome of executing a single node through the pipeline."""

    success: bool
    output: dict
    artifacts: list[str] = field(default_factory=list)
    response: CapabilityResponse | None = None
    error: str | None = None
    duration_ms: int = 0


# ---------------------------------------------------------------------------
# Integration pipeline
# ---------------------------------------------------------------------------

class IntegrationPipeline:
    """Executes swarm nodes through ACDS integration.

    Handles the full lifecycle: node config -> capability request ->
    ACDS execution -> artifact generation -> lineage recording.
    """

    def __init__(self, acds: ACDSClient, workspace: Path):
        self._acds = acds
        self._workspace = workspace
        self._lineage = LineageTracker(workspace)
        self._last_entry_id: str | None = None

    @property
    def lineage(self) -> LineageTracker:
        """Access the lineage tracker for inspection or save."""
        return self._lineage

    # ------------------------------------------------------------------
    # Cognitive node
    # ------------------------------------------------------------------

    def execute_cognitive_node(
        self,
        config: CognitiveNodeConfig,
        node_input: dict,
        context: ExecutionContext,
    ) -> NodeResult:
        """Execute a cognitive node through ACDS."""
        t0 = time.monotonic()

        req = CapabilityRequest(
            capability=config.capability,
            input=node_input,
            constraints=config.constraints,
            context=context,
        )

        try:
            resp = self._acds.request(req)
        except IntegrationError as exc:
            duration = int((time.monotonic() - t0) * 1000)
            result = NodeResult(
                success=False,
                output={},
                error=str(exc),
                duration_ms=duration,
            )
            self._record_lineage(
                context=context,
                node_type="cognitive",
                capability=config.capability,
                node_input=node_input,
                output={},
                artifacts=[],
                duration_ms=duration,
                response=None,
            )
            return result

        duration = int((time.monotonic() - t0) * 1000)

        # Write artifact if configured
        artifacts: list[str] = []
        if config.output_artifact_type and resp.output:
            artifact_path = self._write_artifact(
                context, config.output_artifact_type, resp.output
            )
            artifacts.append(str(artifact_path))

        self._record_lineage(
            context=context,
            node_type="cognitive",
            capability=config.capability,
            node_input=node_input,
            output=resp.output,
            artifacts=artifacts,
            duration_ms=duration,
            response=resp,
        )

        return NodeResult(
            success=True,
            output=resp.output,
            artifacts=artifacts,
            response=resp,
            duration_ms=duration,
        )

    # ------------------------------------------------------------------
    # Control node
    # ------------------------------------------------------------------

    def execute_control_node(
        self,
        config: ControlNodeConfig,
        node_input: dict,
        context: ExecutionContext,
    ) -> str:
        """Execute a control node and return the selected branch.

        Uses ACDS text.classify to determine the branch, then maps
        the classification to a downstream node ID.
        """
        t0 = time.monotonic()

        req = CapabilityRequest(
            capability=config.capability,
            input=node_input,
            constraints=RequestConstraints(local_only=True),
            context=context,
        )

        try:
            resp = self._acds.request(req)
        except IntegrationError as exc:
            duration = int((time.monotonic() - t0) * 1000)
            self._record_lineage(
                context=context,
                node_type="control",
                capability=config.capability,
                node_input=node_input,
                output={},
                artifacts=[],
                duration_ms=duration,
                response=None,
            )
            # Default to first branch on failure
            if config.branches:
                return next(iter(config.branches.values()))
            return ""

        duration = int((time.monotonic() - t0) * 1000)

        decision = resp.output.get("text", "").strip().lower()
        # Try to match decision against configured branches
        branch = config.branches.get(decision, "")
        if not branch and config.branches:
            # Fuzzy: try partial match
            for key, target in config.branches.items():
                if key.lower() in decision:
                    branch = target
                    break

        self._record_lineage(
            context=context,
            node_type="control",
            capability=config.capability,
            node_input=node_input,
            output=resp.output,
            artifacts=[],
            duration_ms=duration,
            response=resp,
        )

        return branch

    # ------------------------------------------------------------------
    # Policy node
    # ------------------------------------------------------------------

    def execute_policy_node(
        self,
        config: PolicyNodeConfig,
        node_input: dict,
        context: ExecutionContext,
    ) -> bool:
        """Execute a policy evaluation node.

        Returns True if the policy allows continuation, False if denied.
        """
        t0 = time.monotonic()

        policy_input = dict(node_input)
        if config.policy_id:
            policy_input["policy_id"] = config.policy_id

        req = CapabilityRequest(
            capability=config.policy_capability,
            input=policy_input,
            constraints=RequestConstraints(local_only=True),
            context=context,
        )

        try:
            resp = self._acds.request(req)
        except IntegrationError as exc:
            duration = int((time.monotonic() - t0) * 1000)
            self._record_lineage(
                context=context,
                node_type="policy",
                capability=config.policy_capability,
                node_input=policy_input,
                output={},
                artifacts=[],
                duration_ms=duration,
                response=None,
            )
            # Deny on error if block_on_deny is set
            return not config.block_on_deny

        duration = int((time.monotonic() - t0) * 1000)

        # Parse verdict from response
        text = resp.output.get("text", "").strip().lower()
        allowed = text in ("allow", "pass", "approved", "true", "yes")

        self._record_lineage(
            context=context,
            node_type="policy",
            capability=config.policy_capability,
            node_input=policy_input,
            output=resp.output,
            artifacts=[],
            duration_ms=duration,
            response=resp,
        )

        return allowed

    # ------------------------------------------------------------------
    # Aggregation node
    # ------------------------------------------------------------------

    def execute_aggregation_node(
        self,
        config: AggregationNodeConfig,
        prior_results: dict,
    ) -> dict:
        """Aggregate outputs from prior nodes.

        Strategies:
        - concatenate: join text values sequentially
        - structured: merge dicts with key dedup
        - summary: return merged dict (caller may pipe to ACDS for summary)
        """
        source_data: dict[str, Any] = {}
        for node_id in config.source_nodes:
            if node_id in prior_results:
                source_data[node_id] = prior_results[node_id]

        if config.merge_strategy == "concatenate":
            parts: list[str] = []
            for node_id, data in source_data.items():
                if isinstance(data, dict):
                    text = data.get("text", json.dumps(data))
                elif isinstance(data, str):
                    text = data
                else:
                    text = str(data)
                parts.append(f"[{node_id}] {text}")
            return {"text": "\n\n".join(parts), "source_count": len(parts)}

        if config.merge_strategy == "structured":
            merged: dict[str, Any] = {}
            for node_id, data in source_data.items():
                if isinstance(data, dict):
                    for k, v in data.items():
                        if k not in merged:
                            merged[k] = v
                        else:
                            # Collect duplicates under a list
                            existing = merged[k]
                            if not isinstance(existing, list):
                                merged[k] = [existing, v]
                            else:
                                existing.append(v)
                else:
                    merged[node_id] = data
            return merged

        # summary or unknown: return raw source data for downstream processing
        return {"sources": source_data, "strategy": config.merge_strategy}

    # ------------------------------------------------------------------
    # Lineage helpers
    # ------------------------------------------------------------------

    def _record_lineage(
        self,
        *,
        context: ExecutionContext,
        node_type: str,
        capability: str | None,
        node_input: dict,
        output: dict,
        artifacts: list[str],
        duration_ms: int,
        response: CapabilityResponse | None,
    ) -> None:
        """Record a lineage entry for this execution step."""
        from swarm.integration.lineage import LineageTracker

        entry = LineageEntry(
            process_id=context.process_id,
            node_id=context.node_id,
            node_type=node_type,
            capability=capability,
            provider_id=response.provider_id if response else None,
            request_id=response.request_id if response else None,
            input_hash=LineageTracker.hash_data(node_input),
            output_hash=LineageTracker.hash_data(output),
            decision_trace=(
                {
                    "selected": response.decision_trace.selected_provider,
                    "candidates": response.decision_trace.candidates_evaluated,
                    "fallback_chain": response.decision_trace.fallback_chain,
                }
                if response and response.decision_trace
                else None
            ),
            artifacts=artifacts,
            duration_ms=duration_ms,
            parent_entry_id=self._last_entry_id,
        )
        self._lineage.record(entry)
        self._last_entry_id = entry.entry_id

    def _write_artifact(
        self,
        context: ExecutionContext,
        artifact_type: str,
        output: dict,
    ) -> Path:
        """Write an output artifact to the workspace."""
        artifacts_dir = self._workspace / "artifacts" / context.process_id
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{context.node_id}_{artifact_type}.json"
        path = artifacts_dir / filename
        path.write_text(json.dumps(output, indent=2, default=str))
        return path
