"""Tests for swarm.argus_hold.validator — SchemaValidator (Stage 2)."""

from __future__ import annotations

from swarm.argus_hold.models import (
    CommandEnvelope,
    SideEffectLevel,
    StageVerdict,
    new_id,
    now_utc,
)
from swarm.argus_hold.validator import SchemaValidator


def _make_envelope(params: dict, command_name: str = "filesystem.read_file") -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters=params,
        side_effect_level=SideEffectLevel.READ_ONLY,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


class TestSchemaValidatorHappyPath:
    """Tests for valid parameters passing schema validation."""

    def test_valid_read_file(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": "test.txt"})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.PASSED
        assert result.stage_name == "schema_validation"
        assert result.errors == []

    def test_valid_read_file_with_optional_fields(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": "test.txt", "encoding": "utf-8", "max_bytes": 1024})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.PASSED

    def test_valid_write_file(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.write_file")
        env = _make_envelope(
            {"path": "out.txt", "content": "hello"},
            command_name="filesystem.write_file",
        )
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.PASSED

    def test_no_schema_passes_with_warning(self):
        validator = SchemaValidator()
        env = _make_envelope({"anything": "goes"})
        spec = {"parameters_schema": {}}
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.PASSED
        assert len(result.warnings) > 0
        assert result.details["schema_present"] is False


class TestSchemaValidatorFailures:
    """Tests for invalid parameters failing schema validation."""

    def test_missing_required_path(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.FAILED
        assert len(result.errors) > 0
        assert any("path" in e for e in result.errors)

    def test_wrong_type_for_path(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": 12345})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.FAILED
        assert any("type" in e.lower() or "string" in e.lower() for e in result.errors)

    def test_extra_field_rejected(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": "test.txt", "rogue_field": "evil"})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.FAILED
        assert len(result.errors) > 0

    def test_invalid_encoding_value(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": "test.txt", "encoding": "invalid-enc"})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.FAILED

    def test_max_bytes_below_minimum(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": "test.txt", "max_bytes": 0})
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.FAILED

    def test_multiple_errors_collected(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.write_file")
        env = _make_envelope(
            {"rogue": True},
            command_name="filesystem.write_file",
        )
        result = validator.validate(env, spec)
        assert result.verdict == StageVerdict.FAILED
        # Missing path and content, plus extra field
        assert len(result.errors) >= 2

    def test_error_count_in_details(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({})
        result = validator.validate(env, spec)
        assert result.details["error_count"] == len(result.errors)

    def test_duration_ms_is_nonnegative(self, registry):
        validator = SchemaValidator()
        spec = registry.get_spec("filesystem.read_file")
        env = _make_envelope({"path": "x.txt"})
        result = validator.validate(env, spec)
        assert result.duration_ms >= 0
