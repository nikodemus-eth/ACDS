"""Shared fixtures for OpenShell Layer tests."""

from __future__ import annotations

import pytest
from pathlib import Path

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.registry import CommandRegistry
from swarm.openshell.models import (
    CommandEnvelope,
    SideEffectLevel,
    PolicyDecision,
    ScopeCheck,
    StageResult,
    StageVerdict,
    new_id,
    now_utc,
)


@pytest.fixture
def workspace(tmp_path):
    """Create a workspace directory for a test run."""
    ws = tmp_path / "workspace" / "run-test"
    ws.mkdir(parents=True)
    return ws


@pytest.fixture
def config(tmp_path):
    """Create an OpenShellConfig scoped to a temporary run."""
    return OpenShellConfig.for_run(tmp_path, "run-test")


@pytest.fixture
def registry():
    """Load the real command registry from the bundled specs."""
    return CommandRegistry()


@pytest.fixture
def read_file_envelope(workspace):
    """A valid filesystem.read_file envelope."""
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="filesystem.read_file",
        version="v1",
        parameters={"path": "hello.txt"},
        side_effect_level=SideEffectLevel.READ_ONLY,
        run_id="run-test",
        swarm_id="swarm-test",
        created_at=now_utc(),
    )


@pytest.fixture
def write_file_envelope():
    """A valid filesystem.write_file envelope."""
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="filesystem.write_file",
        version="v1",
        parameters={"path": "output.txt", "content": "Hello, world!"},
        side_effect_level=SideEffectLevel.LOCAL_MUTATION,
        run_id="run-test",
        swarm_id="swarm-test",
        created_at=now_utc(),
    )


@pytest.fixture
def list_dir_envelope():
    """A valid filesystem.list_dir envelope."""
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="filesystem.list_dir",
        version="v1",
        parameters={"path": "."},
        side_effect_level=SideEffectLevel.READ_ONLY,
        run_id="run-test",
        swarm_id="swarm-test",
        created_at=now_utc(),
    )


@pytest.fixture
def http_envelope():
    """A valid http.fetch_whitelisted envelope."""
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="http.fetch_whitelisted",
        version="v1",
        parameters={"url": "https://example.com/data.json"},
        side_effect_level=SideEffectLevel.EXTERNAL_ACTION,
        run_id="run-test",
        swarm_id="swarm-test",
        created_at=now_utc(),
    )


@pytest.fixture
def allow_policy():
    """A policy decision that allows execution."""
    return PolicyDecision(
        allowed=True,
        decision="allow",
        reason="Allowed by test",
        matched_rule="default_allow",
    )


@pytest.fixture
def deny_policy():
    """A policy decision that denies execution."""
    return PolicyDecision(
        allowed=False,
        decision="deny",
        reason="Denied by test",
        matched_rule="test_deny",
    )


@pytest.fixture
def good_scope():
    """A scope check that passes."""
    return ScopeCheck(in_scope=True, checked_paths=["/tmp/ok"])


@pytest.fixture
def make_action():
    """Factory for creating action dicts."""
    def _make(tool_name, config_params=None, dry_run=False, metadata=None):
        return {
            "tool_name": tool_name,
            "config": config_params or {},
            "dry_run": dry_run,
            "metadata": metadata or {},
        }
    return _make
