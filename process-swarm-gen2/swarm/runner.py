"""SwarmRunner — end-to-end orchestrator bridging platform to runtime.

Manages the complete lifecycle:
  Registry → Compiler → Runtime Pipeline → Delivery → Audit

The database is a coordination store, not a trust anchor. All critical
state is recomputed from scratch before execution.
"""
from __future__ import annotations

import hashlib
import json
import logging
import tempfile
from pathlib import Path
from typing import Union

from process_swarm.acds_client import (
    ACDSClient,
    ACDSClientError,
    DispatchRunRequest,
    RoutingConstraints,
    RoutingRequest,
)
from process_swarm.config import load_inference_config
from process_swarm.inference import InferenceProvider, create_inference_provider
from swarm.compiler.compiler import BehaviorSequenceCompiler
from swarm.delivery.engine import DeliveryEngine
from swarm.events.recorder import EventRecorder
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository
from swarm.scheduler.evaluator import ScheduleEvaluator
from swarm.tools.registry import AdapterRegistry

logger = logging.getLogger(__name__)


class SwarmRunner:
    """Top-level orchestrator connecting platform layer to runtime kernel."""

    def __init__(
        self,
        openclaw_root: Union[str, Path],
        db_path: Union[str, Path, None] = None,
        inference_config: dict | None = None,
    ):
        self.openclaw_root = Path(openclaw_root)
        if db_path is None:
            db_path = self.openclaw_root / "platform.db"
        self._db_path = db_path

        # Database setup
        is_memory = str(db_path) == ":memory:"
        self.db = RegistryDatabase(str(db_path))
        self.db.connect()
        self.db.migrate()

        # Integrity check (fail-closed)
        if not is_memory:
            integrity_errors = self.db.verify_integrity()
            if integrity_errors:
                raise RuntimeError("Database integrity check failed — aborting")

        # Core components
        self.repo = SwarmRepository(self.db)
        self.events = EventRecorder(self.repo)
        self.compiler = BehaviorSequenceCompiler(
            workspace_root=self.openclaw_root / "workspace"
        )
        import os as _os
        from swarm.delivery.validation import load_smtp_profile
        smtp_profile = load_smtp_profile(self.openclaw_root)
        self.delivery = DeliveryEngine(
            self.repo, self.events,
            smtp_config=smtp_profile,
            telegram_bot_token=_os.environ.get("TELEGRAM_BOT_TOKEN"),
        )
        self.scheduler = ScheduleEvaluator(self.repo, self.events)
        self.adapter_registry = AdapterRegistry.create_default()

        # Inference provider (ACDS or rules-only)
        config = inference_config or load_inference_config()
        self.inference: InferenceProvider = create_inference_provider(config)

        # ACDS client for execution tracking
        self._acds_client: ACDSClient | None = None
        if config.get("provider") == "acds":
            self._acds_client = ACDSClient(
                base_url=config.get("acds_base_url", "http://localhost:3100"),
                auth_token=config.get("acds_auth_token"),
                timeout_seconds=config.get("acds_timeout_seconds", 30),
            )

        # ARGUS-Hold governed execution layer (optional)
        self._argus_hold = None

        # Lazy pipeline runner
        self._pipeline_runner = None

    @property
    def argus_hold(self):
        """Lazy-init ARGUS-Hold dispatcher, scoped per workspace."""
        if self._argus_hold is None:
            try:
                from swarm.argus_hold import ARGUSHoldConfig, ARGUSHoldDispatcher
                # Default config — scoped to workspace root
                config = ARGUSHoldConfig.for_run(self.openclaw_root, "_shared")
                self._argus_hold = ARGUSHoldDispatcher(config)
            except Exception:
                logger.debug("ARGUS-Hold layer not available", exc_info=True)
                self._argus_hold = False  # Sentinel: don't retry
        return self._argus_hold if self._argus_hold is not False else None

    @property
    def pipeline_runner(self):
        if self._pipeline_runner is None:
            from runtime.pipeline.runner import PipelineRunner
            self._pipeline_runner = PipelineRunner(str(self.openclaw_root))
        return self._pipeline_runner

    def close(self) -> None:
        self.db.close()

    def run_swarm_now(self, swarm_id: str) -> dict:
        run_id = self.repo.create_run(swarm_id, "manual")
        return self.execute_run(run_id)

    def _acds_dispatch_run_event(
        self, run_id: str, swarm_id: str, swarm_name: str, step: str,
    ) -> str | None:
        """Create an ACDS execution record for this Process Swarm run.

        Returns the ACDS executionId or None if ACDS is unavailable.
        """
        if not self._acds_client:
            return None
        try:
            swarm = self.repo.get_swarm(swarm_id)
            desc = (swarm or {}).get("description", "")[:200]
            routing = RoutingRequest(
                application="process_swarm",
                process=swarm_name,
                step=step,
                taskType="planning",
                loadTier="single_shot",
                decisionPosture="operational",
                cognitiveGrade="basic",
                input=f"Run {run_id} for swarm {swarm_name}",
                constraints=RoutingConstraints(
                    privacy="local_only",
                    maxLatencyMs=30000,
                    costSensitivity="low",
                    structuredOutputRequired=False,
                    traceabilityRequired=True,
                ),
            )
            request = DispatchRunRequest(
                routingRequest=routing,
                inputPayload=f"Process Swarm run lifecycle event: {step}. {desc}",
                inputFormat="text",
                requestId=run_id,
            )
            response = self._acds_client.dispatch(request)
            logger.info(
                "ACDS dispatch for %s/%s: executionId=%s status=%s",
                swarm_name, step, response.executionId, response.status,
            )
            return response.executionId
        except ACDSClientError as e:
            logger.warning("ACDS dispatch failed for %s/%s: %s", swarm_name, step, e)
            return None
        except Exception as e:
            logger.warning("ACDS dispatch unexpected error: %s", e)
            return None

    def execute_run(self, run_id: str) -> dict:
        run = self.repo.get_run(run_id)
        if not run:
            raise ValueError(f"Run not found: {run_id}")

        swarm_id = run["swarm_id"]

        try:
            # Verify preconditions
            preconditions = self._verify_execution_preconditions(swarm_id, run_id)

            # Mark as running
            with self.repo.atomic():
                self.repo.update_run(run_id, run_status="running")
                self.events.run_started(swarm_id, run_id)

            # Register run with ACDS for execution tracking
            swarm = preconditions.get("swarm", {})
            swarm_name = swarm.get("swarm_name", swarm_id)
            acds_exec_id = self._acds_dispatch_run_event(
                run_id, swarm_id, swarm_name, "run_started",
            )

            # Get behavior sequence
            bs = preconditions.get("behavior_sequence")
            raw_steps = bs.get("ordered_steps_json", "[]") if bs else "[]"
            steps = json.loads(raw_steps)

            # Classify execution path
            step_ops = set()
            for step in steps:
                op = step.get("operation_type", "")
                step_ops.add(op)

            has_adapter_actions = "invoke_capability" in step_ops
            has_fs_actions = bool(step_ops & {"create", "modify", "append", "delete"})

            # Execute
            if has_adapter_actions and not has_fs_actions:
                # Pure adapter path
                actions = self._steps_to_adapter_actions(steps)
                exec_result = self._execute_via_adapters(run_id, swarm_id, actions)
            elif has_adapter_actions and has_fs_actions:
                # Mixed mode: adapters first, then M4 pipeline
                adapter_steps = [s for s in steps if s.get("operation_type") == "invoke_capability"]
                fs_steps = [s for s in steps if s.get("operation_type") != "invoke_capability"]
                actions = self._steps_to_adapter_actions(adapter_steps)
                exec_result = self._execute_via_adapters(run_id, swarm_id, actions)
                if exec_result.get("execution_status") == "succeeded" and fs_steps:
                    proposal = self._build_proposal_from_steps(swarm_id, fs_steps)
                    exec_result = self._execute_via_pipeline(run_id, proposal)
            else:
                # M4 pipeline path
                proposal = self._build_proposal_from_steps(swarm_id, steps)
                exec_result = self._execute_via_pipeline(run_id, proposal)

            # Update run status
            status = exec_result.get("execution_status", "succeeded")
            artifact_refs = exec_result.get("artifacts", [])
            runtime_exec_id = acds_exec_id or exec_result.get("runtime_execution_id")

            with self.repo.atomic():
                self.repo.update_run(
                    run_id,
                    run_status=status,
                    runtime_execution_id=runtime_exec_id,
                    artifact_refs_json=json.dumps(artifact_refs) if artifact_refs else None,
                )
                self.events.run_completed(swarm_id, run_id, status)

            # Trigger delivery
            self._try_deliver(run_id)

            return exec_result

        except Exception as e:
            # Record failure
            with self.repo.atomic():
                self.repo.update_run(
                    run_id,
                    run_status="failed",
                    error_summary=str(e)[:500],
                )
                self.events.run_completed(swarm_id, run_id, "failed")
            raise

    def process_scheduled_runs(self) -> list[dict]:
        run_ids = self.scheduler.evaluate_due_schedules()
        results = []
        for run_id in run_ids:
            try:
                result = self.execute_run(run_id)
                results.append(result)
            except Exception as e:
                logger.error("Scheduled run %s failed: %s", run_id, e)
        return results

    def _verify_execution_preconditions(
        self, swarm_id: str, run_id: str
    ) -> dict:
        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm not found: {swarm_id}")

        if swarm.get("lifecycle_status") != "enabled":
            raise ValueError(
                f"Swarm '{swarm_id}' is not enabled (status={swarm.get('lifecycle_status')})"
            )

        # Find behavior sequence
        bs = self.repo.get_behavior_sequence_by_swarm(swarm_id)
        if not bs:
            raise ValueError(f"No behavior sequence for swarm {swarm_id}")
        raw_steps = bs.get("ordered_steps_json", "[]")
        steps = json.loads(raw_steps)
        if not steps:
            raise ValueError(f"Empty behavior sequence for swarm {swarm_id}")

        # Check run is queued
        run = self.repo.get_run(run_id)
        if run and run.get("run_status") != "queued":
            raise ValueError(
                f"Run {run_id} is not queued (status={run.get('run_status')})"
            )

        self.events.record(
            swarm_id, "preconditions_verified", "system",
            f"Preconditions verified for run {run_id}",
        )

        return {"swarm": swarm, "behavior_sequence": bs}

    def _execute_via_adapters(
        self, run_id: str, swarm_id: str, actions: list[dict]
    ) -> dict:
        import time as _time
        from swarm.tools.base import ToolContext

        prior_results: dict = {}
        all_artifacts: list[str] = []
        warnings: list[str] = []
        inference_trace: list[dict] = []

        workspace = self.openclaw_root / "workspace" / run_id
        workspace.mkdir(parents=True, exist_ok=True)

        for action in actions:
            tool_name = action.get("tool_name", "")

            # Route through ARGUS-Hold if it handles this command
            argus_hold = self.argus_hold
            if argus_hold and argus_hold.handles(tool_name):
                t0 = _time.monotonic()
                # Create per-run config scoped to this workspace
                from swarm.argus_hold import ARGUSHoldConfig
                run_config = ARGUSHoldConfig.for_run(self.openclaw_root, run_id)
                from swarm.argus_hold import ARGUSHoldDispatcher
                run_dispatcher = ARGUSHoldDispatcher(run_config)
                cmd_result = run_dispatcher.execute(
                    run_id=run_id,
                    swarm_id=swarm_id,
                    action=action,
                    workspace_root=workspace,
                    prior_results=prior_results,
                )
                result = ARGUSHoldDispatcher.to_tool_result(cmd_result)
                wall_ms = int((_time.monotonic() - t0) * 1000)
            else:
                adapter = self.adapter_registry.get_adapter(tool_name)
                if not adapter:
                    logger.warning("No adapter for tool: %s", tool_name)
                    continue

                ctx = ToolContext(
                    run_id=run_id,
                    swarm_id=swarm_id,
                    action=action,
                    workspace_root=workspace,
                    repo=self.repo,
                    prior_results=prior_results,
                    config=action.get("config", {}),
                    inference=self.inference,
                )
                t0 = _time.monotonic()
                result = adapter.execute(ctx)
                wall_ms = int((_time.monotonic() - t0) * 1000)

            prior_results[tool_name] = result.output_data
            all_artifacts.extend(result.artifacts)
            warnings.extend(result.warnings)

            # Build inference trace entry
            trace_entry = {
                "step": action.get("step_id", tool_name),
                "tool": tool_name,
                "engine": result.metadata.get("engine") if result.metadata else None,
                "model": result.metadata.get("model") if result.metadata else None,
                "latency_ms": result.metadata.get("duration_ms", wall_ms) if result.metadata else wall_ms,
                "success": result.success,
                "description": action.get("description", ""),
            }
            if result.metadata:
                trace_entry["fallback_engine"] = result.metadata.get("fallback_engine")
            inference_trace.append(trace_entry)

            if not result.success:
                self._write_inference_trace(workspace, inference_trace)
                return {
                    "execution_status": "failed",
                    "artifacts": all_artifacts,
                    "adapter_results": prior_results,
                    "inference_trace": inference_trace,
                    "warnings": warnings,
                    "error": result.error,
                }

        self._write_inference_trace(workspace, inference_trace)
        return {
            "execution_status": "succeeded",
            "artifacts": all_artifacts,
            "adapter_results": prior_results,
            "inference_trace": inference_trace,
            "warnings": warnings,
        }

    @staticmethod
    def _write_inference_trace(workspace, trace: list[dict]) -> None:
        """Write inference trace to workspace as a JSON artifact."""
        import json as _json
        trace_path = workspace / "inference_trace.json"
        trace_path.write_text(_json.dumps(trace, indent=2))

    def _execute_via_pipeline(self, run_id: str, proposal: dict) -> dict:
        tmp_path = self._write_temp_proposal(proposal)
        try:
            record = self.pipeline_runner.run(tmp_path)
            return {
                "execution_status": record.get("status", "succeeded"),
                "runtime_execution_id": record.get("execution_id"),
                "artifacts": record.get("artifacts", []),
            }
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def _steps_to_adapter_actions(self, steps: list[dict]) -> list[dict]:
        actions = []
        for step in steps:
            tool = step.get("tool_name") or step.get("capability", "")
            actions.append({
                "tool_name": tool,
                "action_id": step.get("step_id", ""),
                "config": step.get("parameters", {}),
            })
        return actions

    def _build_proposal_from_steps(
        self, swarm_id: str, steps: list[dict]
    ) -> dict:
        from datetime import datetime, timezone

        modifications = []
        target_paths = []
        for step in steps:
            path = step.get("target_path", "")
            modifications.append({
                "path": path,
                "operation": step.get("operation_type", "modify"),
                "content": step.get("content", ""),
            })
            if path:
                target_paths.append(path)

        return {
            "proposal_id": f"auto-{swarm_id}",
            "source": "internal",
            "intent": f"Auto-generated proposal for swarm {swarm_id}",
            "target_paths": target_paths or ["workspace/"],
            "modifications": modifications,
            "acceptance_tests": [{
                "test_id": f"auto-test-{swarm_id}",
                "command": "echo ok",
                "expected_exit_code": 0,
            }],
            "scope_boundary": {
                "allowed_paths": target_paths or ["workspace/"],
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    def _write_temp_proposal(self, proposal: dict) -> str:
        fd, path = tempfile.mkstemp(suffix=".json", prefix="proposal_")
        with open(fd, "w") as f:
            json.dump(proposal, f, indent=2)
        return path

    def _try_deliver(self, run_id: str) -> None:
        """Attempt delivery, logging any unexpected failures."""
        try:
            self.delivery.deliver(run_id)
        except Exception as e:
            logger.warning("Delivery failed for run %s: %s", run_id, e)

    @staticmethod
    def _compute_artifact_digest(artifact_path: str) -> str | None:
        try:
            data = Path(artifact_path).read_bytes()
            return hashlib.sha256(data).hexdigest()
        except (OSError, IOError):
            return None
