"""Tests for swarm.openshell.registry — CommandRegistry."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from swarm.openshell.registry import CommandRegistry


class TestCommandRegistryLoading:
    """Tests for spec loading from JSON files."""

    def test_loads_bundled_specs(self):
        reg = CommandRegistry()
        commands = reg.list_commands()
        assert len(commands) >= 6
        assert "filesystem.read_file" in commands
        assert "filesystem.write_file" in commands
        assert "filesystem.list_dir" in commands
        assert "report.render_markdown" in commands
        assert "http.fetch_whitelisted" in commands
        assert "tts.generate" in commands

    def test_loads_from_custom_dir(self, tmp_path):
        spec = {
            "command_name": "custom.cmd",
            "version": "v1",
            "parameters_schema": {"type": "object"},
        }
        (tmp_path / "custom.json").write_text(json.dumps(spec))
        reg = CommandRegistry(tmp_path)
        assert reg.has_command("custom.cmd")

    def test_empty_dir_produces_empty_registry(self, tmp_path):
        reg = CommandRegistry(tmp_path)
        assert reg.list_commands() == []

    def test_nonexistent_dir_produces_empty_registry(self, tmp_path):
        reg = CommandRegistry(tmp_path / "no_such_dir")
        assert reg.list_commands() == []


class TestCommandRegistryValidation:
    """Tests for spec validation during loading."""

    def test_missing_required_field_raises(self, tmp_path):
        spec = {"command_name": "bad.cmd", "version": "v1"}
        # Missing parameters_schema
        (tmp_path / "bad.json").write_text(json.dumps(spec))
        with pytest.raises(ValueError, match="missing required fields"):
            CommandRegistry(tmp_path)

    def test_duplicate_command_name_raises(self, tmp_path):
        spec = {
            "command_name": "dup.cmd",
            "version": "v1",
            "parameters_schema": {"type": "object"},
        }
        (tmp_path / "a.json").write_text(json.dumps(spec))
        (tmp_path / "b.json").write_text(json.dumps(spec))
        with pytest.raises(ValueError, match="duplicate command_name"):
            CommandRegistry(tmp_path)


class TestCommandRegistryLookup:
    """Tests for get_spec, has_command, list_commands."""

    def test_get_spec_returns_dict(self):
        reg = CommandRegistry()
        spec = reg.get_spec("filesystem.read_file")
        assert isinstance(spec, dict)
        assert spec["command_name"] == "filesystem.read_file"

    def test_get_spec_unknown_returns_none(self):
        reg = CommandRegistry()
        assert reg.get_spec("nonexistent.command") is None

    def test_has_command_true(self):
        reg = CommandRegistry()
        assert reg.has_command("filesystem.read_file") is True

    def test_has_command_false(self):
        reg = CommandRegistry()
        assert reg.has_command("no.such.cmd") is False

    def test_list_commands_sorted(self):
        reg = CommandRegistry()
        cmds = reg.list_commands()
        assert cmds == sorted(cmds)
