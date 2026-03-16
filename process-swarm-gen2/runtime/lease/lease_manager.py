"""Capability lease management for the M4 sovereign runtime.

Leases are time-bounded authority grants that bind to specific execution plans.
A lease authorizes specific capabilities for a bounded scope and time window.

Lease lifecycle: issued -> active -> expired/revoked -> archived
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from runtime.identity.signer import sign_and_attach


def issue_lease(
    plan: dict,
    granted_capabilities: dict,
    denied_capabilities: dict,
    scope_constraints: dict,
    duration_seconds: int,
    node_id: str,
    keys_dir: Path,
    leases_dir: Optional[Path] = None,
) -> dict:
    """Issue a capability lease for an execution plan.

    Returns a signed capability_lease artifact.
    """
    now = datetime.now(timezone.utc)
    expires = datetime.fromtimestamp(
        now.timestamp() + duration_seconds, tz=timezone.utc
    )

    lease = {
        "lease_id": f"lease-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}",
        "issued_by": "lease_issuer_signer",
        "node_id": node_id,
        "execution_plan_id": plan.get("plan_id"),
        "granted_capabilities": granted_capabilities,
        "denied_capabilities": denied_capabilities,
        "scope_constraints": scope_constraints,
        "valid_from": now.isoformat(),
        "expires_at": expires.isoformat(),
        "revocation_status": "active",
    }

    lease = sign_and_attach(lease, "lease_issuer_signer", keys_dir)

    if leases_dir is not None:
        save_lease(lease, leases_dir)

    return lease


def check_lease_validity(lease: dict) -> tuple:
    """Check if a lease is currently valid.

    Returns (valid: bool, reason: str).
    """
    status = lease.get("revocation_status", "")
    if status == "revoked":
        return False, "Lease has been revoked"
    if status == "expired":
        return False, "Lease has expired"
    if status != "active":
        return False, f"Lease status is '{status}', expected 'active'"

    now = datetime.now(timezone.utc)

    valid_from_str = lease.get("valid_from")
    if valid_from_str:
        valid_from = datetime.fromisoformat(valid_from_str)
        if now < valid_from:
            return False, "Lease is not yet valid"

    expires_at_str = lease.get("expires_at")
    if expires_at_str:
        expires_at = datetime.fromisoformat(expires_at_str)
        if now > expires_at:
            return False, "Lease has expired"

    return True, "Lease is valid"


def revoke_lease(
    lease_id: str,
    reason: str,
    leases_dir: Path,
    keys_dir: Path,
) -> dict:
    """Revoke a lease before expiration."""
    active_dir = leases_dir / "active"
    revoked_dir = leases_dir / "revoked"
    revoked_dir.mkdir(parents=True, exist_ok=True)

    lease_path = None
    for f in active_dir.glob("*.json"):
        with open(f) as fh:
            data = json.load(fh)
            if data.get("lease_id") == lease_id:
                lease_path = f
                break

    if lease_path is None:
        raise FileNotFoundError(f"Active lease not found: {lease_id}")

    with open(lease_path) as f:
        lease = json.load(f)

    lease["revocation_status"] = "revoked"

    dest = revoked_dir / lease_path.name
    with open(dest, "w") as f:
        json.dump(lease, f, indent=2)
    lease_path.unlink()

    revocation_event = {
        "lease_id": lease_id,
        "revoked_at": datetime.now(timezone.utc).isoformat(),
        "revoked_by": "lease_issuer_signer",
        "reason": reason,
    }
    revocation_event = sign_and_attach(
        revocation_event, "lease_issuer_signer", keys_dir
    )

    event_path = revoked_dir / f"{lease_id}_revocation.json"
    with open(event_path, "w") as f:
        json.dump(revocation_event, f, indent=2)

    return revocation_event


def save_lease(lease: dict, leases_dir: Path) -> Path:
    """Save a lease to the active directory."""
    active_dir = leases_dir / "active"
    active_dir.mkdir(parents=True, exist_ok=True)

    lease_id = lease.get("lease_id", "unknown")
    dest = active_dir / f"{lease_id}.json"

    with open(dest, "w") as f:
        json.dump(lease, f, indent=2)

    return dest


def load_lease(path: Path) -> dict:
    """Load a lease artifact from disk."""
    with open(path) as f:
        return json.load(f)


def list_leases(leases_dir: Path, status_filter: Optional[str] = None) -> list:
    """List all leases, optionally filtered by status directory."""
    results = []
    subdirs = ["active", "expired", "revoked"]

    if status_filter:
        subdirs = [status_filter]

    for subdir in subdirs:
        d = leases_dir / subdir
        if d.exists():
            for f in sorted(d.glob("*.json")):
                if f.name.endswith("_revocation.json"):
                    continue
                with open(f) as fh:
                    results.append(json.load(fh))

    return results


def build_capabilities_from_plan(plan: dict) -> tuple:
    """Build granted/denied capabilities dicts from an execution plan.

    Returns (granted_capabilities, denied_capabilities, scope_constraints).
    """
    required = set(plan.get("required_capabilities", []))

    granted = {}
    if "FILESYSTEM_WRITE" in required:
        granted["filesystem"] = {
            "allowed_paths": plan.get("scope_constraints", {}).get(
                "allowed_paths", []
            ),
            "write": True,
        }
    if "FILESYSTEM_READ" in required:
        granted["filesystem"] = granted.get("filesystem", {})
        granted["filesystem"]["allowed_paths"] = plan.get(
            "scope_constraints", {}
        ).get("allowed_paths", [])
    if "TEST_EXECUTION" in required:
        granted["test_execution"] = {"allowed": True}
    if "ARTIFACT_GENERATION" in required:
        granted["artifact_generation"] = {"allowed": True}

    denied = {
        "network_access": True,
        "dependency_installation": True,
    }

    scope = plan.get("scope_constraints", {})
    scope_constraints = {
        "max_files_modified": len(plan.get("steps", [])),
        "allowed_paths": scope.get("allowed_paths", []),
    }

    return granted, denied, scope_constraints
