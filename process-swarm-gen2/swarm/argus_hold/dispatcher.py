"""ARGUS-Hold Dispatcher — pipeline orchestrator for governed command execution.

Wires the 8-stage pipeline: normalize → validate → policy → scope → plan
→ execute → emit → ledger. Converts CommandResult to ToolResult for
SwarmRunner compatibility.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from swarm.argus_hold.artifact_emitter import ArtifactEmitter
from swarm.argus_hold.config import ARGUSHoldConfig
from swarm.argus_hold.errors import ExecutionError
from swarm.argus_hold.execution_planner import ExecutionPlanner
from swarm.argus_hold.ledger_writer import LedgerWriter
from swarm.argus_hold.models import (
    CommandEnvelope,
    CommandResult,
    StageResult,
    StageVerdict,
    new_id,
    now_utc,
)
from swarm.argus_hold.normalizer import Normalizer
from swarm.argus_hold.policy_engine import PolicyEngine
from swarm.argus_hold.registry import CommandRegistry
from swarm.argus_hold.scope_guard import ScopeGuard
from swarm.argus_hold.validator import SchemaValidator
from swarm.tools.base import ToolResult


class ARGUSHoldDispatcher:
    """Governed execution gateway for ARGUS-Hold commands.

    Routes registered commands through the full governance pipeline.
    Commands not in the registry are signaled for passthrough to existing
    ToolAdapter infrastructure.
    """

    def __init__(self, config: ARGUSHoldConfig) -> None:
        self.config = config
        self.registry = CommandRegistry(config.command_specs_dir)
        self.normalizer = Normalizer(self.registry)
        self.validator = SchemaValidator()
        self.policy_engine = PolicyEngine(config)
        self.scope_guard = ScopeGuard(config)
        self.planner = ExecutionPlanner()
        self.emitter = ArtifactEmitter(config)
        self.ledger = LedgerWriter(config)

        # ARGUS-Hold-specific adapters (not ToolAdapters)
        from swarm.argus_hold.adapters.filesystem import FilesystemAdapter
        from swarm.argus_hold.adapters.http import HttpAdapter
        from swarm.argus_hold.adapters.report import ReportAdapter
        from swarm.argus_hold.adapters.tts import TtsAdapter

        self._adapters: dict[str, Any] = {
            "filesystem": FilesystemAdapter(),
            "report": ReportAdapter(),
            "http": HttpAdapter(),
            "tts": TtsAdapter(),
        }

    def handles(self, tool_name: str) -> bool:
        """Return True if tool_name is an ARGUS-Hold-registered command."""
        return self.registry.has_command(tool_name)

    def execute(
        self,
        run_id: str,
        swarm_id: str,
        action: dict,
        workspace_root: Path,
        prior_results: dict,
    ) -> CommandResult:
        """Execute a command through the full governance pipeline.

        Returns a CommandResult with all stage results, artifacts, and
        ledger entries.
        """
        t0 = time.monotonic()
        stages: list[StageResult] = []

        # ── Stage 1: Normalize ──────────────────────────────────
        st = time.monotonic()
        envelope = self.normalizer.normalize(action, run_id, swarm_id)
        if envelope is None:
            # Should not happen if handles() was checked first
            return self._build_failure(
                new_id("env"), run_id, stages,
                "Command not in registry", t0,
            )
        stages.append(StageResult(
            stage_name="normalize",
            verdict=StageVerdict.PASSED,
            duration_ms=_ms_since(st),
            details={"command_name": envelope.command_name, "envelope_id": envelope.envelope_id},
        ))

        # ── Stage 2: Validate ───────────────────────────────────
        spec = self.registry.get_spec(envelope.command_name)
        validation = self.validator.validate(envelope, spec)
        stages.append(validation)
        if validation.verdict == StageVerdict.FAILED:
            return self._build_denied(envelope, stages, "validation_failed", t0)

        # ── Stage 3: Policy ─────────────────────────────────────
        st = time.monotonic()
        decision = self.policy_engine.evaluate(envelope, spec)
        stages.append(StageResult(
            stage_name="policy",
            verdict=StageVerdict.PASSED if decision.allowed else StageVerdict.FAILED,
            duration_ms=_ms_since(st),
            details={"decision": decision.decision, "reason": decision.reason, "rule": decision.matched_rule},
        ))
        if not decision.allowed:
            return self._build_denied(envelope, stages, "denied", t0)

        # ── Stage 4: Scope ──────────────────────────────────────
        st = time.monotonic()
        scope = self.scope_guard.check(envelope, workspace_root)
        stages.append(StageResult(
            stage_name="scope",
            verdict=StageVerdict.PASSED if scope.in_scope else StageVerdict.FAILED,
            duration_ms=_ms_since(st),
            details={"checked_paths": scope.checked_paths, "checked_hosts": scope.checked_hosts},
            errors=scope.violations,
        ))
        if not scope.in_scope:
            return self._build_denied(envelope, stages, "scope_violation", t0)

        # ── Stage 5: Plan ───────────────────────────────────────
        st = time.monotonic()
        plan = self.planner.build(envelope, decision, scope, spec)
        stages.append(StageResult(
            stage_name="plan",
            verdict=StageVerdict.PASSED,
            duration_ms=_ms_since(st),
            details={"adapter": plan.adapter_name, "timeout_ms": plan.timeout_ms},
        ))

        # ── Stage 6: Execute ────────────────────────────────────
        st = time.monotonic()
        outcome = "executed"
        exec_output: dict = {}

        if envelope.dry_run:
            outcome = "dry_run"
            exec_output = plan.dry_run_result or {"dry_run": True, "message": "No side effects"}
            stages.append(StageResult(
                stage_name="execute",
                verdict=StageVerdict.PASSED,
                duration_ms=_ms_since(st),
                details={"dry_run": True},
            ))
        else:
            adapter = self._adapters.get(plan.adapter_name)
            if adapter is None:
                return self._build_failure(
                    envelope.envelope_id, run_id, stages,
                    f"No adapter for namespace: {plan.adapter_name}", t0,
                )
            try:
                exec_output = adapter.execute_command(envelope, workspace_root, prior_results)
                # Check for TTS stub
                if exec_output.get("implemented") is False:
                    outcome = "stub_not_implemented"
            except ExecutionError as exc:
                stages.append(StageResult(
                    stage_name="execute",
                    verdict=StageVerdict.FAILED,
                    duration_ms=_ms_since(st),
                    errors=[str(exc)],
                ))
                return self._build_denied(envelope, stages, "error", t0)
            except Exception as exc:
                stages.append(StageResult(
                    stage_name="execute",
                    verdict=StageVerdict.FAILED,
                    duration_ms=_ms_since(st),
                    errors=[f"Unexpected: {exc}"],
                ))
                return self._build_denied(envelope, stages, "error", t0)

            stages.append(StageResult(
                stage_name="execute",
                verdict=StageVerdict.PASSED,
                duration_ms=_ms_since(st),
            ))

        # ── Stage 7: Emit artifacts ─────────────────────────────
        st = time.monotonic()
        artifact_paths = self.emitter.emit(envelope, stages, exec_output)
        stages.append(StageResult(
            stage_name="emit",
            verdict=StageVerdict.PASSED,
            duration_ms=_ms_since(st),
            details={"artifact_count": len(artifact_paths)},
        ))

        # ── Stage 8: Ledger ─────────────────────────────────────
        st = time.monotonic()
        ledger_entry = self.ledger.append(envelope, stages, outcome)
        stages.append(StageResult(
            stage_name="ledger",
            verdict=StageVerdict.PASSED,
            duration_ms=_ms_since(st),
            details={"entry_id": ledger_entry.entry_id, "chain_hash": ledger_entry.chain_hash[:16]},
        ))

        # Write summary artifact
        result = CommandResult(
            result_id=new_id("res"),
            plan_id=plan.plan_id,
            envelope_id=envelope.envelope_id,
            success=True,
            output_data=exec_output,
            artifacts_produced=artifact_paths,
            error=None,
            stage_results=stages,
            total_duration_ms=_ms_since(t0),
        )
        summary_dir = Path(self.config.artifact_root) / envelope.envelope_id
        summary_dir.mkdir(parents=True, exist_ok=True)
        self.emitter.emit_summary(result, str(summary_dir))

        return result

    def _build_denied(
        self,
        envelope: CommandEnvelope,
        stages: list[StageResult],
        outcome: str,
        t0: float,
    ) -> CommandResult:
        """Build a failed CommandResult for denied/failed commands."""
        # Still emit artifacts and ledger for denied commands
        artifact_paths = self.emitter.emit(envelope, stages)
        self.ledger.append(envelope, stages, outcome)

        last_errors = []
        for s in reversed(stages):
            if s.errors:
                last_errors = s.errors
                break

        return CommandResult(
            result_id=new_id("res"),
            plan_id="",
            envelope_id=envelope.envelope_id,
            success=False,
            output_data={},
            artifacts_produced=artifact_paths,
            error="; ".join(last_errors) if last_errors else f"Command {outcome}",
            stage_results=stages,
            total_duration_ms=_ms_since(t0),
        )

    def _build_failure(
        self,
        envelope_id: str,
        run_id: str,
        stages: list[StageResult],
        error_msg: str,
        t0: float,
    ) -> CommandResult:
        """Build a failure result for internal errors (no envelope available)."""
        return CommandResult(
            result_id=new_id("res"),
            plan_id="",
            envelope_id=envelope_id,
            success=False,
            output_data={},
            artifacts_produced=[],
            error=error_msg,
            stage_results=stages,
            total_duration_ms=_ms_since(t0),
        )

    @staticmethod
    def to_tool_result(cmd_result: CommandResult) -> ToolResult:
        """Convert a CommandResult to a ToolResult for SwarmRunner compatibility."""
        return ToolResult(
            success=cmd_result.success,
            output_data=cmd_result.output_data,
            artifacts=cmd_result.artifacts_produced,
            error=cmd_result.error,
            metadata={
                "argus_hold": True,
                "envelope_id": cmd_result.envelope_id,
                "stage_count": len(cmd_result.stage_results),
                "total_duration_ms": cmd_result.total_duration_ms,
            },
            warnings=[w for sr in cmd_result.stage_results for w in sr.warnings],
        )


def _ms_since(t0: float) -> int:
    """Milliseconds elapsed since monotonic timestamp t0."""
    return int((time.monotonic() - t0) * 1000)
