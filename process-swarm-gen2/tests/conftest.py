"""Shared test fixtures for the Process Swarm Gen 2 runtime."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from runtime.identity.key_manager import SIGNER_ROLES, generate_keypair, save_keypair


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
def schemas_dir():
    """Return the path to the real schemas directory."""
    return Path(__file__).parent.parent / "schemas"


@pytest.fixture
def sample_proposal():
    """Load the sample valid proposal fixture."""
    fixture_path = Path(__file__).parent / "fixtures" / "sample_proposal.json"
    with open(fixture_path) as f:
        return json.load(f)


@pytest.fixture
def sample_proposal_invalid_scope():
    """Load the sample invalid-scope proposal fixture."""
    fixture_path = (
        Path(__file__).parent / "fixtures" / "sample_proposal_invalid_scope.json"
    )
    with open(fixture_path) as f:
        return json.load(f)


@pytest.fixture
def sample_proposal_undeclared():
    """Load the sample undeclared-effects proposal fixture."""
    fixture_path = (
        Path(__file__).parent
        / "fixtures"
        / "sample_proposal_undeclared_effects.json"
    )
    with open(fixture_path) as f:
        return json.load(f)


@pytest.fixture
def openclaw_root(tmp_path, keys_dir, schemas_dir):
    """Create a minimal runtime root directory for integration tests."""
    root = tmp_path / "openclaw"
    root.mkdir()

    # Copy schemas
    schemas_dest = root / "schemas"
    shutil.copytree(schemas_dir, schemas_dest)

    # Copy keys
    keys_dest = root / "runtime" / "identity" / "keys"
    shutil.copytree(keys_dir, keys_dest)

    # Create directory structure
    (root / "artifacts" / "proposals").mkdir(parents=True)
    (root / "artifacts" / "validation").mkdir(parents=True)
    (root / "artifacts" / "plans").mkdir(parents=True)
    (root / "artifacts" / "leases" / "active").mkdir(parents=True)
    (root / "artifacts" / "leases" / "expired").mkdir(parents=True)
    (root / "artifacts" / "leases" / "revoked").mkdir(parents=True)
    (root / "artifacts" / "executions").mkdir(parents=True)
    (root / "artifacts" / "exchange").mkdir(parents=True)
    (root / "ingress" / "quarantine").mkdir(parents=True)
    (root / "ingress" / "validated").mkdir(parents=True)
    (root / "ingress" / "rejected").mkdir(parents=True)
    (root / "ledger").mkdir(parents=True)
    (root / "workspace").mkdir(parents=True)

    # Create empty ledger log
    (root / "ledger" / "execution_ledger.log").touch()

    # Create node_identity.json
    from runtime.identity.signer import sign_and_attach
    from runtime.identity.key_manager import load_verify_key, fingerprint

    att_key = load_verify_key("node_attestation_signer", keys_dest)
    att_fp = fingerprint(att_key.encode())

    identity = {
        "node_id": "m4-exec-001",
        "node_role": "execution_node",
        "environment_class": "local_sovereign_runtime",
        "status": "active",
        "trust_chain_version": 1,
        "attestation_key_fingerprint": att_fp,
        "key_registry_ref": "key_registry.json",
        "baseline_manifest_ref": "baseline.manifest.json",
        "created_at": "2026-03-10T00:00:00+00:00",
    }
    identity = sign_and_attach(identity, "node_attestation_signer", keys_dest)
    with open(root / "node_identity.json", "w") as f:
        json.dump(identity, f, indent=2)

    # Create key_registry.json
    key_entries = []
    for role in SIGNER_ROLES:
        vk = load_verify_key(role, keys_dest)
        fp = fingerprint(vk.encode())
        key_entries.append({
            "role": role,
            "key_id": f"{role.replace('_', '-')}-001",
            "algorithm": "ed25519",
            "fingerprint": fp,
            "status": "active",
            "public_key_path": f"{role}.pub",
            "created_at": "2026-03-10T00:00:00+00:00",
        })

    registry = {
        "registry_version": 1,
        "node_id": "m4-exec-001",
        "active_keys": key_entries,
        "revoked_keys": [],
        "superseded_keys": [],
    }
    with open(root / "key_registry.json", "w") as f:
        json.dump(registry, f, indent=2)

    return root
