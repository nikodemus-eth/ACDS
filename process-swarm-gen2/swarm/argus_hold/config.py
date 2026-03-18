"""Configuration for the ARGUS-Hold Layer.

ARGUSHoldConfig holds all tunables governing filesystem scope,
network scope, privilege limits, timeouts, and artifact paths.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class ARGUSHoldConfig:
    """Runtime configuration for the ARGUS-Hold dispatch pipeline."""

    allowed_read_roots: list[str]
    allowed_write_roots: list[str]
    denied_fs_patterns: list[str]
    allowed_hosts: list[str]
    blocked_hosts: list[str]
    max_privilege_level: int
    dry_run_default: bool
    max_file_read_bytes: int
    max_file_write_bytes: int
    max_http_response_bytes: int
    command_timeout_seconds: int
    artifact_root: str
    ledger_root: str
    command_specs_dir: str
    emit_stage_artifacts: bool

    @classmethod
    def for_run(cls, openclaw_root: Path, run_id: str) -> ARGUSHoldConfig:
        """Create a run-scoped config with sane defaults.

        Restricts read/write to the run workspace and blocks
        well-known dangerous network targets.
        """
        workspace = openclaw_root / "workspace" / run_id
        return cls(
            allowed_read_roots=[str(workspace)],
            allowed_write_roots=[str(workspace)],
            denied_fs_patterns=[
                "**/.git/**",
                "**/__pycache__/**",
                "**/node_modules/**",
            ],
            allowed_hosts=[],
            blocked_hosts=[
                "localhost",
                "127.0.0.1",
                "0.0.0.0",
                "169.254.169.254",
                "[::1]",
            ],
            max_privilege_level=4,
            dry_run_default=False,
            max_file_read_bytes=10 * 1024 * 1024,
            max_file_write_bytes=10 * 1024 * 1024,
            max_http_response_bytes=5 * 1024 * 1024,
            command_timeout_seconds=30,
            artifact_root=str(workspace / "argus_hold" / "artifacts"),
            ledger_root=str(workspace / "argus_hold" / "ledger"),
            command_specs_dir=str(Path(__file__).parent / "command_specs"),
            emit_stage_artifacts=True,
        )
