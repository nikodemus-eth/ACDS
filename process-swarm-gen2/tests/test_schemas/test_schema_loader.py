"""Tests for schema loading."""

from __future__ import annotations

from pathlib import Path

import pytest

from runtime.schemas.loader import get_all_schemas, list_schema_names, load_schema

SCHEMAS_DIR = Path(__file__).parent.parent.parent / "schemas"


class TestLoadSchema:
    def test_load_known_schema(self):
        schema = load_schema("behavior_proposal", SCHEMAS_DIR)
        assert isinstance(schema, dict)
        assert "properties" in schema or "type" in schema

    def test_load_with_extension(self):
        schema = load_schema("behavior_proposal.schema.json", SCHEMAS_DIR)
        assert isinstance(schema, dict)

    def test_load_unknown_raises(self):
        with pytest.raises(FileNotFoundError):
            load_schema("nonexistent_schema", SCHEMAS_DIR)

    def test_all_schemas_loadable(self):
        for name in list_schema_names(SCHEMAS_DIR):
            schema = load_schema(name, SCHEMAS_DIR)
            assert isinstance(schema, dict), f"Failed to load {name}"


class TestGetAllSchemas:
    def test_returns_dict(self):
        schemas = get_all_schemas(SCHEMAS_DIR)
        assert isinstance(schemas, dict)
        assert len(schemas) >= 18

    def test_keys_are_schema_names(self):
        schemas = get_all_schemas(SCHEMAS_DIR)
        assert "behavior_proposal" in schemas
        assert "execution_plan" in schemas


class TestListSchemaNames:
    def test_returns_sorted_list(self):
        names = list_schema_names(SCHEMAS_DIR)
        assert isinstance(names, list)
        assert names == sorted(names)

    def test_contains_expected_schemas(self):
        names = list_schema_names(SCHEMAS_DIR)
        expected = [
            "behavior_proposal",
            "behavior_validation_result",
            "capability_lease",
            "execution_plan",
            "execution_record",
            "node_identity",
        ]
        for name in expected:
            assert name in names, f"Missing schema: {name}"

    def test_count(self):
        names = list_schema_names(SCHEMAS_DIR)
        assert len(names) == 18
