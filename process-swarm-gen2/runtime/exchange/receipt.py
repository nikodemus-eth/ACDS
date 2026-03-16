"""Exchange receipt generation for the M4 sovereign runtime."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from runtime.identity.signer import sign_and_attach


def create_receipt(
    artifact_id: str,
    origin_node: str,
    validation_status: str,
    keys_dir: Path,
    validator_signer_fingerprint: str = "",
    notes: str = "",
) -> dict:
    """Create a signed exchange receipt."""
    receipt = {
        "receipt_id": str(uuid.uuid4()),
        "artifact_id": artifact_id,
        "origin_node": origin_node,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "validation_status": validation_status,
    }
    if validator_signer_fingerprint:
        receipt["validator_signer_fingerprint"] = validator_signer_fingerprint
    if notes:
        receipt["notes"] = notes

    receipt = sign_and_attach(receipt, "node_attestation_signer", keys_dir)
    return receipt


def save_receipt(receipt: dict, exchange_dir: Path) -> Path:
    """Save an exchange receipt to disk."""
    exchange_dir.mkdir(parents=True, exist_ok=True)
    receipt_id = receipt.get("receipt_id", str(uuid.uuid4()))
    dest = exchange_dir / f"{receipt_id}.json"
    with open(dest, "w") as f:
        json.dump(receipt, f, indent=2)
    return dest
