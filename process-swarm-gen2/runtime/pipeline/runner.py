"""End-to-end pipeline runner for the M4 sovereign runtime.

Orchestrates the full execution pipeline:
  Proposal -> Validation -> Compilation -> Lease -> Gate -> Execution -> Ledger
"""

from __future__ import annotations

import json
from pathlib import Path

from runtime.compiler.compiler import compile_plan
from runtime.exchange.ingress import IngressHandler
from runtime.exchange.receipt import create_receipt, save_receipt
from runtime.executor.executor import Executor
from runtime.gate.execution_gate import ExecutionGate
from runtime.gate.toolgate import ToolGate
from runtime.lease.lease_manager import (
    build_capabilities_from_plan,
    issue_lease,
)
from runtime.ledger.ledger_writer import (
    append_to_log,
    record_execution,
    save_record,
)
from runtime.proposal.proposal_loader import load_proposal, store_proposal
from runtime.validation.validator import validate_proposal


class PipelineRunner:
    """End-to-end pipeline orchestrator."""

    def __init__(self, openclaw_root: str | Path):
        self.root = Path(openclaw_root).resolve()
        self.keys_dir = self.root / "runtime" / "identity" / "keys"
        self.schemas_dir = self.root / "schemas"
        self.workspace_dir = self.root / "workspace"
        self.artifacts_dir = self.root / "artifacts"
        self.ingress_dir = self.root / "ingress"
        self.ledger_log = self.root / "ledger" / "execution_ledger.log"

        with open(self.root / "node_identity.json") as f:
            self.identity = json.load(f)

        with open(self.root / "key_registry.json") as f:
            self.key_registry = json.load(f)

        self.node_id = self.identity.get("node_id", "m4-exec-001")

    def run(self, proposal_path: str | Path) -> dict:
        """Execute the full 7-stage pipeline for a proposal.

        Returns the execution record artifact.
        """
        proposal_path = Path(proposal_path)

        # 1. Load and store proposal
        proposal = load_proposal(proposal_path, self.schemas_dir)
        store_proposal(proposal, self.artifacts_dir / "proposals")

        # 2. Validate proposal
        validation_result = validate_proposal(
            proposal, self.keys_dir, self.schemas_dir
        )

        val_dir = self.artifacts_dir / "validation"
        val_dir.mkdir(parents=True, exist_ok=True)
        val_path = val_dir / f"{validation_result['validation_id']}.json"
        with open(val_path, "w") as f:
            json.dump(validation_result, f, indent=2)

        if validation_result["status"] != "passed":
            raise ValueError(
                "Proposal validation failed: "
                + "; ".join(
                    c["detail"]
                    for c in validation_result["checks"]
                    if not c["passed"]
                )
            )

        # 3. Compile execution plan
        plan = compile_plan(
            proposal, validation_result, self.keys_dir, self.schemas_dir
        )

        plans_dir = self.artifacts_dir / "plans"
        plans_dir.mkdir(parents=True, exist_ok=True)
        plan_path = plans_dir / f"{plan['plan_id']}.json"
        with open(plan_path, "w") as f:
            json.dump(plan, f, indent=2)

        # 4. Issue capability lease
        granted, denied, scope = build_capabilities_from_plan(plan)
        lease = issue_lease(
            plan=plan,
            granted_capabilities=granted,
            denied_capabilities=denied,
            scope_constraints=scope,
            duration_seconds=300,
            node_id=self.node_id,
            keys_dir=self.keys_dir,
            leases_dir=self.artifacts_dir / "leases",
        )

        # 5. Gate check
        self._enforce_gate(plan, validation_result, lease)

        # 6. Execute with ToolGate enforcement
        toolgate = ToolGate()
        toolgate.bind_lease(lease)

        executor = Executor(
            toolgate=toolgate,
            workspace_dir=self.workspace_dir,
        )

        exec_result = executor.execute(plan, lease)

        # 7. Record in ledger
        record = record_execution(
            plan_id=plan["plan_id"],
            lease_id=lease["lease_id"],
            actions=exec_result["actions"],
            artifacts_generated=exec_result["artifacts_generated"],
            acceptance_results=exec_result["acceptance_results"],
            execution_status=exec_result["execution_status"],
            keys_dir=self.keys_dir,
            node_id=self.node_id,
        )

        executions_dir = self.artifacts_dir / "executions"
        save_record(record, executions_dir)
        append_to_log(record, self.ledger_log)

        return record

    def ingest_from_m2(self) -> list:
        """Process artifacts from M2 exports through quarantine."""
        m2_exports_dir = self.root / "m2_exports"
        if not m2_exports_dir.exists():
            return []

        handler = IngressHandler(self.ingress_dir, self.schemas_dir)

        new_artifacts = handler.scan_exports(m2_exports_dir)
        for artifact_path in new_artifacts:
            handler.quarantine(artifact_path)

        results = handler.process_quarantine()

        for result in results:
            if result["status"] in ("accepted", "rejected"):
                receipt = create_receipt(
                    artifact_id=Path(result["artifact_path"]).stem,
                    origin_node="m2",
                    validation_status=result["status"],
                    keys_dir=self.keys_dir,
                )
                save_receipt(receipt, self.artifacts_dir / "exchange")

        return results

    def _enforce_gate(
        self, plan: dict, validation_result: dict, lease: dict
    ) -> None:
        """Run the execution gate and raise on denial."""
        gate = ExecutionGate()
        decision = gate.check(
            plan=plan,
            validation_result=validation_result,
            lease=lease,
            keys_dir=self.keys_dir,
        )
        if not decision.allowed:
            raise ValueError(
                f"Execution gate denied: {'; '.join(decision.reasons)}"
            )
