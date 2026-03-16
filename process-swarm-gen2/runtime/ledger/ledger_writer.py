"""Execution ledger recorder for the M4 sovereign runtime.

Records execution events as structured, signed artifacts.
Append-only — records are never modified or deleted.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from runtime.identity.signer import sign_and_attach


def record_execution(
    plan_id: str,
    lease_id: str,
    actions: list,
    artifacts_generated: list,
    acceptance_results: list,
    execution_status: str,
    keys_dir: Path,
    node_id: str = "m4-exec-001",
) -> dict:
    """Create a signed execution record."""
    record = {
        "record_id": str(uuid.uuid4()),
        "plan_id": plan_id,
        "lease_id": lease_id,
        "actions": actions,
        "artifacts_generated": artifacts_generated,
        "acceptance_results": acceptance_results,
        "execution_status": execution_status,
        "executor_node_id": node_id,
        "executed_at": datetime.now(timezone.utc).isoformat(),
    }

    record = sign_and_attach(record, "node_attestation_signer", keys_dir)
    return record


def save_record(record: dict, executions_dir: Path) -> Path:
    """Save an execution record to the artifacts/executions directory."""
    executions_dir.mkdir(parents=True, exist_ok=True)
    record_id = record.get("record_id", str(uuid.uuid4()))
    dest = executions_dir / f"{record_id}.json"
    with open(dest, "w") as f:
        json.dump(record, f, indent=2)
    return dest


def load_record(path: Path) -> dict:
    """Load an execution record from disk."""
    with open(path) as f:
        return json.load(f)


def append_to_log(record: dict, log_path: Path) -> None:
    """Append an execution summary to the text log (append-only)."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = record.get("executed_at", "unknown")
    plan_id = record.get("plan_id", "unknown")
    status = record.get("execution_status", "unknown")
    record_id = record.get("record_id", "unknown")
    line = f"[{timestamp}] record={record_id} plan={plan_id} status={status}\n"
    with open(log_path, "a") as f:
        f.write(line)
