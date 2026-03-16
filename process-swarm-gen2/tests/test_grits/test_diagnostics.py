from __future__ import annotations

"""Tests for GRITS diagnostic test suites."""

import json
from pathlib import Path

import pytest

from grits.diagnostics import smoke, drift, redteam


@pytest.fixture
def diag_context(tmp_path):
    """Create a context with a minimal openclaw root."""
    root = tmp_path / "openclaw"
    root.mkdir()

    # Create schemas
    schemas_dir = root / "schemas"
    schemas_dir.mkdir()
    for name in ["behavior_proposal", "grits_run_request", "node_identity"]:
        schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
        }
        (schemas_dir / f"{name}.schema.json").write_text(json.dumps(schema))

    # Create key files
    keys_dir = root / "runtime" / "identity" / "keys"
    keys_dir.mkdir(parents=True)
    (keys_dir / "validator_signer.pub").write_text("ab" * 32)
    (keys_dir / "validator_signer.key").write_text("cd" * 32)
    (keys_dir / "compiler_signer.pub").write_text("ef" * 32)

    return {"openclaw_root": str(root)}


def test_smoke_schemas_exist_returns_tuple(diag_context):
    """smoke.test_schemas_exist returns (status, metrics, evidence)."""
    status, metrics, evidence = smoke.test_schemas_exist(diag_context)
    assert status == "passed"
    assert "count" in metrics
    assert metrics["count"] == 3


def test_smoke_schemas_exist_fails_no_dir():
    """smoke.test_schemas_exist fails when schemas dir missing."""
    status, metrics, evidence = smoke.test_schemas_exist(
        {"openclaw_root": "/nonexistent/path"}
    )
    assert status == "failed"


def test_smoke_schemas_valid_json(diag_context):
    """smoke.test_schemas_valid_json passes for valid JSON files."""
    status, metrics, evidence = smoke.test_schemas_valid_json(diag_context)
    assert status == "passed"


def test_smoke_schemas_valid_json_detects_invalid(diag_context):
    """smoke.test_schemas_valid_json fails for invalid JSON."""
    root = Path(diag_context["openclaw_root"])
    (root / "schemas" / "bad.schema.json").write_text("{invalid json")

    status, metrics, evidence = smoke.test_schemas_valid_json(diag_context)
    assert status == "failed"
    assert metrics["invalid_count"] == 1


def test_smoke_adapters_importable(diag_context):
    """smoke.test_adapters_importable succeeds when module is importable."""
    status, metrics, evidence = smoke.test_adapters_importable(diag_context)
    assert status == "passed"


def test_smoke_key_files_exist(diag_context):
    """smoke.test_key_files_exist finds key files."""
    status, metrics, evidence = smoke.test_key_files_exist(diag_context)
    assert status == "passed"
    assert metrics["count"] >= 2


def test_smoke_database_accessible_no_db(diag_context):
    """smoke.test_database_accessible passes gracefully without db."""
    status, metrics, evidence = smoke.test_database_accessible(diag_context)
    # Passes in reporting-only mode even without a db
    assert status == "passed"


def test_drift_schema_count_returns_count(diag_context):
    """drift.test_schema_count_drift reports schema count."""
    status, metrics, evidence = drift.test_schema_count_drift(diag_context)
    assert status == "passed"
    assert metrics["count"] == 3


def test_drift_key_fingerprint_returns_fingerprints(diag_context):
    """drift.test_key_fingerprint_drift reports key fingerprints."""
    status, metrics, evidence = drift.test_key_fingerprint_drift(diag_context)
    assert status == "passed"
    assert metrics["key_count"] >= 1
    assert "fingerprints" in evidence


def test_redteam_toolgate_default_deny(diag_context):
    """redteam.test_toolgate_default_deny passes."""
    status, metrics, evidence = redteam.test_toolgate_default_deny(diag_context)
    assert status == "passed"


def test_redteam_validator_rejects_dangerous(diag_context):
    """redteam.test_validator_rejects_dangerous passes."""
    status, metrics, evidence = redteam.test_validator_rejects_dangerous(diag_context)
    assert status == "passed"


def test_redteam_scope_blocks_traversal(diag_context):
    """redteam.test_scope_blocks_traversal passes."""
    status, metrics, evidence = redteam.test_scope_blocks_traversal(diag_context)
    assert status == "passed"


def test_diagnostic_return_format(diag_context):
    """All diagnostic tests return (str, dict, dict) tuples."""
    test_fns = [
        smoke.test_schemas_exist,
        smoke.test_schemas_valid_json,
        smoke.test_adapters_importable,
        smoke.test_key_files_exist,
        smoke.test_database_accessible,
        drift.test_schema_count_drift,
        drift.test_key_fingerprint_drift,
        redteam.test_toolgate_default_deny,
        redteam.test_validator_rejects_dangerous,
        redteam.test_scope_blocks_traversal,
    ]

    for fn in test_fns:
        result = fn(diag_context)
        assert isinstance(result, tuple), f"{fn.__name__} did not return tuple"
        assert len(result) == 3, f"{fn.__name__} tuple length != 3"
        status, metrics, evidence = result
        assert isinstance(status, str), f"{fn.__name__} status not str"
        assert status in ("passed", "failed", "error"), f"{fn.__name__} invalid status: {status}"
        assert isinstance(metrics, dict), f"{fn.__name__} metrics not dict"
        assert isinstance(evidence, dict), f"{fn.__name__} evidence not dict"
