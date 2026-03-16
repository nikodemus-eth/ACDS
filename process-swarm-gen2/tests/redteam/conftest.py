"""Shared fixtures for ARGUS-9 red-team tests."""
from __future__ import annotations

import copy
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

from runtime.identity.key_manager import SIGNER_ROLES, generate_keypair, save_keypair
from runtime.identity.signer import sign_and_attach
from runtime.gate.execution_gate import ExecutionGate
from swarm.events.recorder import EventRecorder
from swarm.governance.lifecycle import LifecycleManager
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def db():
    database = RegistryDatabase(":memory:")
    database.connect()
    database.migrate()
    yield database
    database.close()


@pytest.fixture
def repo(db):
    return SwarmRepository(db)


@pytest.fixture
def events(repo):
    return EventRecorder(repo)


@pytest.fixture
def keys_dir(tmp_path):
    """Create a temporary keys directory with all signer role keys."""
    kd = tmp_path / "keys"
    kd.mkdir()
    for role in SIGNER_ROLES:
        signing_key, _ = generate_keypair()
        save_keypair(role, signing_key, kd)
    return kd


@pytest.fixture
def enabled_swarm(repo, events):
    """Creates a swarm fully transitioned to 'enabled' state."""
    swarm_id = repo.create_swarm("Red Team Swarm", "For security tests", "red-team")
    lm = LifecycleManager(repo, events)
    lm.transition(swarm_id, "reviewing", actor_id="author-1", actor_role="author")
    lm.transition(swarm_id, "approved", actor_id="reviewer-1", actor_role="reviewer")
    lm.transition(swarm_id, "enabled", actor_id="admin-1", actor_role="publisher")
    return swarm_id


@pytest.fixture
def drafting_swarm(repo):
    return repo.create_swarm("Draft Swarm", "Still drafting", "user-1")


@pytest.fixture
def workspace_root(tmp_path):
    """Return a temporary workspace root."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    return ws


@pytest.fixture
def gate():
    """Return an ExecutionGate instance."""
    return ExecutionGate()


def build_artifact_chain(
    keys_dir: Path,
    *,
    signed: bool = True,
    proposal_id: str = "prop-001",
    plan_id: str = "plan-001",
    validation_id: str = "val-001",
    lease_id: str = "lease-001",
    lease_duration_hours: int = 1,
) -> tuple[dict, dict, dict]:
    """Build a complete (plan, validation_result, lease) artifact chain.

    Returns:
        (plan, validation_result, lease) tuple.
    """
    now = datetime.now(timezone.utc)

    plan = {
        "plan_id": plan_id,
        "proposal_id": proposal_id,
        "validation_id": validation_id,
        "required_capabilities": ["FILESYSTEM_WRITE"],
        "modifications": [
            {"operation_type": "create", "target_path": "output/report.md", "content": "# Report"}
        ],
        "scope_boundary": str(Path("/tmp/workspace")),
        "scope_constraints": {
            "allowed_paths": ["output/"],
        },
        "acceptance_tests": [
            {"command": "test -f output/report.md", "expected_exit_code": 0}
        ],
        "target_paths": ["output/"],
        "steps": [
            {"step_id": "s1", "operation": "create", "path": "output/report.md"}
        ],
    }

    validation_result = {
        "validation_id": validation_id,
        "proposal_id": proposal_id,
        "status": "passed",
        "checks_passed": 5,
        "checks_failed": 0,
        "checks": [
            {"name": "schema_valid", "passed": True},
            {"name": "scope_contained", "passed": True},
        ],
    }

    lease = {
        "lease_id": lease_id,
        "execution_plan_id": plan_id,
        "capabilities": ["file_create", "file_modify"],
        "granted_capabilities": {
            "filesystem": {
                "allowed_paths": ["output/"],
                "write": True,
            },
        },
        "denied_capabilities": {
            "network_access": True,
        },
        "valid_from": now.isoformat(),
        "expires_at": (now + timedelta(hours=lease_duration_hours)).isoformat(),
        "revocation_status": "active",
        "scope": {"allowed_paths": ["output/"]},
        "scope_constraints": {
            "allowed_paths": ["output/"],
            "max_files_modified": 1,
        },
    }

    if signed:
        plan = sign_and_attach(plan, "compiler_signer", keys_dir)
        validation_result = sign_and_attach(
            validation_result, "validator_signer", keys_dir
        )
        lease = sign_and_attach(lease, "lease_issuer_signer", keys_dir)

    return plan, validation_result, lease
