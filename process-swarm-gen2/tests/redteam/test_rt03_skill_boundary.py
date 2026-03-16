"""RT-03: Skill ABI boundary tests.

Verify the Skill ABI operates strictly in the definition layer.
"""
from __future__ import annotations

import inspect

import pytest

from swarm.abi.api import SwarmSkillABI


@pytest.fixture
def abi(repo, events, workspace_root):
    return SwarmSkillABI(repo, events, str(workspace_root))


class TestSkillBoundary:
    """RT-03: The Skill ABI must operate strictly in the definition layer."""

    def test_abi_has_no_execution_methods(self, abi):
        """ABI must not expose execution-oriented methods."""
        forbidden_methods = [
            "execute",
            "execute_run",
            "sign_plan",
            "invoke_toolgate",
            "write_ledger",
            "start_execution",
            "run_pipeline",
            "invoke_gate",
        ]
        for method_name in forbidden_methods:
            assert not hasattr(abi, method_name), (
                f"SwarmSkillABI has forbidden execution method: {method_name}"
            )

    def test_abi_exposes_only_definition_operations(self, abi):
        """ABI public methods must be a subset of allowed definition operations."""
        allowed = {
            "create_swarm_definition",
            "update_swarm_definition",
            "preview_execution",
            "list_swarms",
            "get_swarm_definition",
            "negotiate_version",
            "configure_schedule",
            "configure_delivery",
            "archive_swarm",
        }
        public_methods = {
            name for name in dir(abi)
            if not name.startswith("_") and callable(getattr(abi, name))
        }
        unexpected = public_methods - allowed
        assert not unexpected, (
            f"SwarmSkillABI exposes unexpected public methods: {unexpected}"
        )

    def test_abi_module_has_no_runtime_imports(self):
        """ABI module source must not import runtime modules."""
        module = inspect.getmodule(SwarmSkillABI)
        source = inspect.getsource(module)
        forbidden = [
            "from runtime",
            "import runtime",
            "runtime.pipeline",
            "runtime.gate",
            "runtime.executor",
        ]
        for pattern in forbidden:
            assert pattern not in source, (
                f"SwarmSkillABI module contains forbidden import: {pattern}"
            )

    def test_lifecycle_status_update_rejected(self, abi, drafting_swarm):
        """Updating lifecycle_status through ABI must be rejected."""
        with pytest.raises(ValueError):
            abi.update_swarm_definition(
                drafting_swarm, "user-1", lifecycle_status="enabled"
            )

    def test_update_non_drafting_rejected(self, abi, enabled_swarm):
        """Updating a swarm not in 'drafting' state must be rejected."""
        with pytest.raises(ValueError):
            abi.update_swarm_definition(
                enabled_swarm, "user-1", description="Updated description"
            )

    def test_update_nonexistent_rejected(self, abi):
        """Updating a nonexistent swarm must be rejected."""
        with pytest.raises(ValueError):
            abi.update_swarm_definition(
                "nonexistent-swarm-id", "user-1", description="Does not exist"
            )

    def test_create_swarm_stays_drafting(self, abi, repo):
        """A newly created swarm must be in 'drafting' state."""
        result = abi.create_swarm_definition(
            name="Test Swarm",
            description="A test swarm",
            step_outline=["Step 1: Do something"],
            created_by="user-1",
        )
        swarm = repo.get_swarm(result["swarm_id"])
        assert swarm["lifecycle_status"] == "drafting"

    def test_preview_does_not_mutate(self, abi, repo, enabled_swarm):
        """preview_execution must not create new events or change state."""
        events_before = repo.list_events(swarm_id=enabled_swarm)
        count_before = len(events_before)

        abi.preview_execution(enabled_swarm)

        events_after = repo.list_events(swarm_id=enabled_swarm)
        count_after = len(events_after)
        assert count_after == count_before, (
            f"preview_execution created {count_after - count_before} new events"
        )

    def test_empty_name_rejected(self, abi):
        """Creating a swarm with an empty name must be rejected."""
        with pytest.raises(ValueError, match="(?i)(non-empty|empty)"):
            abi.create_swarm_definition(
                name="",
                description="A test swarm",
                step_outline=["Step 1"],
                created_by="user-1",
            )

    def test_whitespace_name_rejected(self, abi):
        """Creating a swarm with a whitespace-only name must be rejected."""
        with pytest.raises(ValueError):
            abi.create_swarm_definition(
                name="   ",
                description="A test swarm",
                step_outline=["Step 1"],
                created_by="user-1",
            )

    def test_negotiate_version_rejects_unknown(self, abi):
        """negotiate_version must return False for unknown versions."""
        result = abi.negotiate_version("99.0")
        assert result is False, (
            f"negotiate_version('99.0') returned {result}, expected False"
        )
