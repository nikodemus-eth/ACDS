"""Tests for swarm.openshell.config — OpenShellConfig."""

from __future__ import annotations

from pathlib import Path

from swarm.openshell.config import OpenShellConfig


class TestOpenShellConfig:
    """Tests for OpenShellConfig.for_run() and field defaults."""

    def test_for_run_creates_config(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert isinstance(cfg, OpenShellConfig)

    def test_workspace_scoped_roots(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        ws = str(tmp_path / "workspace" / "run-42")
        assert ws in cfg.allowed_read_roots
        assert ws in cfg.allowed_write_roots

    def test_blocked_hosts_default(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert "localhost" in cfg.blocked_hosts
        assert "127.0.0.1" in cfg.blocked_hosts
        assert "169.254.169.254" in cfg.blocked_hosts
        assert "[::1]" in cfg.blocked_hosts

    def test_no_allowed_hosts_by_default(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert cfg.allowed_hosts == []

    def test_denied_fs_patterns(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert "**/.git/**" in cfg.denied_fs_patterns
        assert "**/__pycache__/**" in cfg.denied_fs_patterns

    def test_size_limits(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert cfg.max_file_read_bytes == 10 * 1024 * 1024
        assert cfg.max_file_write_bytes == 10 * 1024 * 1024
        assert cfg.max_http_response_bytes == 5 * 1024 * 1024

    def test_artifact_and_ledger_roots(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert "openshell" in cfg.artifact_root
        assert "openshell" in cfg.ledger_root
        assert "artifacts" in cfg.artifact_root
        assert "ledger" in cfg.ledger_root

    def test_command_specs_dir_exists(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert Path(cfg.command_specs_dir).is_dir()

    def test_emit_stage_artifacts_enabled(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert cfg.emit_stage_artifacts is True

    def test_max_privilege_level(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert cfg.max_privilege_level == 4

    def test_dry_run_default_false(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert cfg.dry_run_default is False

    def test_command_timeout(self, tmp_path):
        cfg = OpenShellConfig.for_run(tmp_path, "run-42")
        assert cfg.command_timeout_seconds == 30
