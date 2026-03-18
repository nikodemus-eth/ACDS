"""Tests for swarm.openshell.normalizer — Normalizer (Stage 1)."""

from __future__ import annotations

from swarm.openshell.models import CommandEnvelope, SideEffectLevel
from swarm.openshell.normalizer import Normalizer


class TestNormalizerPassthrough:
    """Tests for passthrough behavior on unregistered commands."""

    def test_unregistered_tool_returns_none(self, registry):
        norm = Normalizer(registry)
        action = {"tool_name": "unknown.tool", "config": {"x": 1}}
        result = norm.normalize(action, "run-1", "swarm-1")
        assert result is None

    def test_empty_tool_name_returns_none(self, registry):
        norm = Normalizer(registry)
        action = {"config": {}}
        result = norm.normalize(action, "run-1", "swarm-1")
        assert result is None


class TestNormalizerHappyPath:
    """Tests for successful normalization."""

    def test_read_file_produces_envelope(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "test.txt"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert isinstance(env, CommandEnvelope)
        assert env.command_name == "filesystem.read_file"
        assert env.version == "v1"
        assert env.parameters == {"path": "test.txt"}
        assert env.side_effect_level == SideEffectLevel.READ_ONLY
        assert env.run_id == "run-1"
        assert env.swarm_id == "swarm-1"

    def test_write_file_has_local_mutation_level(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.write_file",
            "config": {"path": "out.txt", "content": "hi"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.side_effect_level == SideEffectLevel.LOCAL_MUTATION

    def test_http_has_external_action_level(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "http.fetch_whitelisted",
            "config": {"url": "https://example.com"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.side_effect_level == SideEffectLevel.EXTERNAL_ACTION

    def test_envelope_id_has_env_prefix(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "x.txt"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.envelope_id.startswith("env-")

    def test_created_at_populated(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "x.txt"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert "T" in env.created_at

    def test_dry_run_forwarded(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "x.txt"},
            "dry_run": True,
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.dry_run is True

    def test_dry_run_default_false(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "x.txt"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.dry_run is False

    def test_metadata_forwarded(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "x.txt"},
            "metadata": {"agent": "test"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.metadata == {"agent": "test"}

    def test_source_action_preserved(self, registry):
        norm = Normalizer(registry)
        action = {
            "tool_name": "filesystem.read_file",
            "config": {"path": "x.txt"},
        }
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.source_action is action

    def test_missing_config_defaults_to_empty(self, registry):
        norm = Normalizer(registry)
        action = {"tool_name": "filesystem.read_file"}
        env = norm.normalize(action, "run-1", "swarm-1")
        assert env.parameters == {}
