"""Tests for swarm.openshell.models — dataclasses, enums, and helpers."""

from __future__ import annotations

import re
from dataclasses import fields

from swarm.openshell.models import (
    CommandEnvelope,
    CommandResult,
    ExecutionPlan,
    LedgerEntry,
    PolicyDecision,
    ScopeCheck,
    SideEffectLevel,
    StageResult,
    StageVerdict,
    new_id,
    now_utc,
)


class TestNewId:
    """Tests for the new_id() helper."""

    def test_starts_with_prefix(self):
        result = new_id("env")
        assert result.startswith("env-")

    def test_contains_hex_suffix(self):
        result = new_id("abc")
        suffix = result.split("-", 1)[1]
        assert re.fullmatch(r"[0-9a-f]{12}", suffix)

    def test_unique_across_calls(self):
        ids = {new_id("x") for _ in range(100)}
        assert len(ids) == 100


class TestNowUtc:
    """Tests for the now_utc() helper."""

    def test_returns_iso_format(self):
        ts = now_utc()
        assert "T" in ts
        # Should contain timezone info (+00:00 or Z)
        assert "+00:00" in ts or "Z" in ts

    def test_returns_string(self):
        assert isinstance(now_utc(), str)


class TestSideEffectLevel:
    """Tests for the SideEffectLevel enum."""

    def test_all_members_present(self):
        expected = {
            "READ_ONLY",
            "CONTROLLED_GENERATION",
            "LOCAL_MUTATION",
            "EXTERNAL_ACTION",
            "PRIVILEGED",
        }
        assert {m.name for m in SideEffectLevel} == expected

    def test_value_roundtrip(self):
        for member in SideEffectLevel:
            assert SideEffectLevel(member.value) is member


class TestStageVerdict:
    """Tests for the StageVerdict enum."""

    def test_all_members_present(self):
        assert {m.name for m in StageVerdict} == {"PASSED", "FAILED", "SKIPPED"}


class TestCommandEnvelope:
    """Tests for the CommandEnvelope dataclass."""

    def test_required_fields(self):
        env = CommandEnvelope(
            envelope_id="env-001",
            command_name="filesystem.read_file",
            version="v1",
            parameters={"path": "test.txt"},
            side_effect_level=SideEffectLevel.READ_ONLY,
            run_id="run-1",
            swarm_id="swarm-1",
            created_at="2026-01-01T00:00:00+00:00",
        )
        assert env.command_name == "filesystem.read_file"
        assert env.dry_run is False

    def test_default_fields(self):
        env = CommandEnvelope(
            envelope_id="env-002",
            command_name="test",
            version="v1",
            parameters={},
            side_effect_level=SideEffectLevel.READ_ONLY,
            run_id="r",
            swarm_id="s",
            created_at="now",
        )
        assert env.metadata == {}
        assert env.source_action == {}
        assert env.dry_run is False


class TestStageResult:
    """Tests for the StageResult dataclass."""

    def test_defaults(self):
        sr = StageResult(
            stage_name="test_stage",
            verdict=StageVerdict.PASSED,
            duration_ms=42,
        )
        assert sr.details == {}
        assert sr.errors == []
        assert sr.warnings == []


class TestPolicyDecision:
    """Tests for the PolicyDecision dataclass."""

    def test_allow(self):
        pd = PolicyDecision(
            allowed=True,
            decision="allow",
            reason="ok",
            matched_rule="default_allow",
        )
        assert pd.allowed is True
        assert pd.constraints == {}


class TestScopeCheck:
    """Tests for the ScopeCheck dataclass."""

    def test_defaults(self):
        sc = ScopeCheck(in_scope=True)
        assert sc.checked_paths == []
        assert sc.checked_hosts == []
        assert sc.violations == []


class TestExecutionPlan:
    """Tests for the ExecutionPlan dataclass."""

    def test_optional_dry_run_result(self):
        env = CommandEnvelope(
            envelope_id="e",
            command_name="test",
            version="v1",
            parameters={},
            side_effect_level=SideEffectLevel.READ_ONLY,
            run_id="r",
            swarm_id="s",
            created_at="now",
        )
        plan = ExecutionPlan(
            plan_id="p",
            envelope=env,
            policy_decision=PolicyDecision(
                allowed=True, decision="allow", reason="ok", matched_rule="r"
            ),
            scope_check=ScopeCheck(in_scope=True),
            adapter_name="filesystem",
            timeout_ms=30000,
        )
        assert plan.expected_artifacts == []
        assert plan.dry_run_result is None


class TestCommandResult:
    """Tests for the CommandResult dataclass."""

    def test_all_fields(self):
        cr = CommandResult(
            result_id="res-1",
            plan_id="plan-1",
            envelope_id="env-1",
            success=True,
            output_data={"key": "value"},
            artifacts_produced=["a.json"],
            error=None,
            stage_results=[],
            total_duration_ms=100,
        )
        assert cr.success is True
        assert cr.metadata == {}


class TestLedgerEntry:
    """Tests for the LedgerEntry dataclass."""

    def test_all_fields_present(self):
        field_names = {f.name for f in fields(LedgerEntry)}
        expected = {
            "entry_id",
            "sequence_number",
            "timestamp",
            "run_id",
            "envelope_id",
            "command_name",
            "stage_summary",
            "outcome",
            "content_hash",
            "prev_hash",
            "chain_hash",
        }
        assert field_names == expected
