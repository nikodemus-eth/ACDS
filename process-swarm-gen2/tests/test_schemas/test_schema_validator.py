"""Tests for schema validation."""

from __future__ import annotations

from pathlib import Path

import pytest

from runtime.schemas.schema_validator import (
    ValidationResult,
    validate_artifact,
    validate_artifact_strict,
)

SCHEMAS_DIR = Path(__file__).parent.parent.parent / "schemas"


class TestValidateArtifact:
    def test_valid_node_identity(self):
        artifact = {
            "node_id": "m4-exec-001",
            "node_role": "execution_node",
            "environment_class": "local_sovereign_runtime",
            "status": "active",
            "trust_chain_version": 1,
        }
        result = validate_artifact(artifact, "node_identity", SCHEMAS_DIR)
        assert result.valid
        assert result.errors == []
        assert result.schema_name == "node_identity"

    def test_invalid_artifact_returns_errors(self):
        artifact = {"node_id": 12345}  # wrong type
        result = validate_artifact(artifact, "node_identity", SCHEMAS_DIR)
        assert not result.valid
        assert len(result.errors) > 0

    def test_missing_schema_returns_error(self):
        result = validate_artifact({}, "nonexistent", SCHEMAS_DIR)
        assert not result.valid
        assert any("Schema not found" in e for e in result.errors)

    def test_result_dataclass(self):
        result = ValidationResult(valid=True, errors=[], schema_name="test")
        assert result.valid
        assert result.schema_name == "test"


class TestValidateArtifactStrict:
    def test_valid_returns_artifact(self):
        artifact = {
            "node_id": "m4-exec-001",
            "node_role": "execution_node",
            "environment_class": "local_sovereign_runtime",
            "status": "active",
            "trust_chain_version": 1,
        }
        result = validate_artifact_strict(artifact, "node_identity", SCHEMAS_DIR)
        assert result == artifact

    def test_invalid_raises_valueerror(self):
        with pytest.raises(ValueError, match="Schema validation failed"):
            validate_artifact_strict({"bad": "data"}, "node_identity", SCHEMAS_DIR)
