"""Tests for SwarmDefiner and the Action Table Pipeline."""

from __future__ import annotations

import json
import pytest

from swarm.definer.capability import (
    seed_default_tools,
    run_preflight,
    check_readiness,
    generate_actions_from_steps,
    resolve_action_type_to_capability_family,
)
from swarm.definer.definer import SwarmDefiner
from swarm.definer.pipeline import (
    ClarificationNeeded,
    InvalidDependencies,
    PipelineResult,
    run_action_table_pipeline,
    validate_dependencies,
)
from swarm.definer.tool_matching import create_tool_match_set_for_swarm
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def repo():
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    return SwarmRepository(db)


@pytest.fixture
def definer(repo):
    return SwarmDefiner(repo=repo, events=None)


@pytest.fixture
def swarm_with_draft(repo):
    """Create a swarm with a draft ready for the definer."""
    swarm_id = repo.create_swarm(
        swarm_name="test-swarm",
        description="A test swarm for definer tests",
        created_by="tester",
    )
    return swarm_id


# ──────────────────────────────────────────────
# SwarmDefiner — Draft
# ──────────────────────────────────────────────


class TestDefinerDraft:
    def test_create_draft(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="Collect data from three sources and generate a report",
            created_by="tester",
        )
        assert draft_id.startswith("draft-")

    def test_empty_text_rejected(self, definer, swarm_with_draft):
        with pytest.raises(ValueError, match="empty"):
            definer.create_draft(
                swarm_id=swarm_with_draft,
                raw_text="",
                created_by="tester",
            )

    def test_whitespace_only_rejected(self, definer, swarm_with_draft):
        with pytest.raises(ValueError, match="empty"):
            definer.create_draft(
                swarm_id=swarm_with_draft,
                raw_text="   \n  ",
                created_by="tester",
            )


# ──────────────────────────────────────────────
# SwarmDefiner — Extract Actions
# ──────────────────────────────────────────────


class TestDefinerExtraction:
    def test_extract_actions_from_draft(self, definer, swarm_with_draft, repo):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data, then validate sources, then generate report",
            created_by="tester",
        )
        result = definer.extract_actions(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
        )
        assert "actions" in result
        assert len(result["actions"]) >= 3

    def test_extract_creates_clarifications_for_issues(self, definer, swarm_with_draft, repo):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="process it then handle that",
            created_by="tester",
        )
        result = definer.extract_actions(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
        )
        clarifications = repo.list_intent_clarifications(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
        )
        assert len(clarifications) > 0

    def test_extract_from_nonexistent_draft_raises(self, definer, swarm_with_draft):
        with pytest.raises(ValueError, match="Draft not found"):
            definer.extract_actions(
                swarm_id=swarm_with_draft,
                draft_id="nonexistent-id",
                actor_id="tester",
            )


# ──────────────────────────────────────────────
# SwarmDefiner — Restatement
# ──────────────────────────────────────────────


class TestDefinerRestatement:
    def test_create_restatement(self, definer, swarm_with_draft, repo):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data and generate report",
            created_by="tester",
        )
        restatement_id = definer.create_restatement(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            summary="Collect data and generate a structured report",
            structured_steps=[
                {"op": "create", "path": "output/report.md", "description": "Generate report"},
            ],
            actor_id="tester",
        )
        assert restatement_id.startswith("restatement-")

    def test_empty_steps_rejected(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="do something",
            created_by="tester",
        )
        with pytest.raises(ValueError, match="empty"):
            definer.create_restatement(
                swarm_id=swarm_with_draft,
                draft_id=draft_id,
                summary="Summary",
                structured_steps=[],
                actor_id="tester",
            )

    def test_empty_summary_rejected(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="do something",
            created_by="tester",
        )
        with pytest.raises(ValueError, match="empty"):
            definer.create_restatement(
                swarm_id=swarm_with_draft,
                draft_id=draft_id,
                summary="",
                structured_steps=[{"op": "create"}],
                actor_id="tester",
            )


# ──────────────────────────────────────────────
# SwarmDefiner — Clarification Loop
# ──────────────────────────────────────────────


class TestDefinerClarification:
    def test_update_extracted_action(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data then send report",
            created_by="tester",
        )
        definer.extract_actions(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
        )
        state = definer.update_extracted_action(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
            step=1,
            updates={"verb": "gather", "object": "all data sources"},
        )
        assert "actions" in state

    def test_add_extracted_action(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data",
            created_by="tester",
        )
        definer.extract_actions(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
        )
        state = definer.add_extracted_action(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
            action={"verb": "validate", "object": "data quality"},
        )
        assert len(state["actions"]) >= 2

    def test_confirm_action_completeness(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data",
            created_by="tester",
        )
        state = definer.confirm_action_completeness(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
            confirmed=True,
        )
        assert state["user_confirmation"] is True
        assert state["user_confirmation_required"] is False

    def test_preview_restatement(self, definer, swarm_with_draft):
        draft_id = definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data then send report",
            created_by="tester",
        )
        preview = definer.preview_restatement_from_actions(
            swarm_id=swarm_with_draft,
            draft_id=draft_id,
            actor_id="tester",
        )
        assert "summary" in preview
        assert "structured_steps" in preview
        assert "can_proceed" in preview


# ──────────────────────────────────────────────
# SwarmDefiner — Clarification State
# ──────────────────────────────────────────────


class TestDefinerState:
    def test_no_intent_phase(self, definer, swarm_with_draft):
        state = definer.get_clarification_state(swarm_with_draft)
        assert state["current_phase"] == "no_intent"

    def test_after_draft_phase(self, definer, swarm_with_draft):
        definer.create_draft(
            swarm_id=swarm_with_draft,
            raw_text="collect data then send report",
            created_by="tester",
        )
        state = definer.get_clarification_state(swarm_with_draft)
        assert state["has_draft"] is True
        assert state["current_phase"] in (
            "ready_for_restatement", "needs_clarification", "awaiting_restatement"
        )

    def test_nonexistent_swarm_raises(self, definer):
        with pytest.raises(ValueError, match="Swarm not found"):
            definer.get_clarification_state("nonexistent-swarm")


# ──────────────────────────────────────────────
# Capability — Tool Seeding
# ──────────────────────────────────────────────


class TestToolSeeding:
    def test_seed_default_tools(self, repo):
        tool_ids = seed_default_tools(repo)
        assert len(tool_ids) >= 18

    def test_seeding_is_idempotent(self, repo):
        ids1 = seed_default_tools(repo)
        ids2 = seed_default_tools(repo)
        assert ids1 == ids2

    def test_resolve_action_type_to_family(self):
        assert resolve_action_type_to_capability_family("file_create") == "file_generation"
        assert resolve_action_type_to_capability_family("delivery") == "notification_delivery"
        assert resolve_action_type_to_capability_family("source_collection") == "data_query"
        assert resolve_action_type_to_capability_family("unknown") is None


# ──────────────────────────────────────────────
# Capability — Action Generator
# ──────────────────────────────────────────────


class TestActionGenerator:
    def test_generate_actions_from_steps(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="gen-swarm", description="test", created_by="tester",
        )
        steps = [
            {"op": "create", "description": "Create file", "display_description": "Create", "path": "output/test.md"},
            {"op": "run_test", "description": "Run tests", "display_description": "Test", "depends_on": [0]},
        ]
        action_ids = generate_actions_from_steps(swarm_id, steps, repo)
        assert len(action_ids) == 2

        actions = repo.list_actions(swarm_id)
        assert len(actions) == 2
        assert actions[0]["action_type"] == "file_create"
        assert actions[1]["action_type"] == "test_run"

    def test_regeneration_clears_old_actions(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="regen-swarm", description="test", created_by="tester",
        )
        steps1 = [{"op": "create", "description": "v1"}]
        steps2 = [{"op": "modify", "description": "v2"}, {"op": "create", "description": "v2b"}]

        generate_actions_from_steps(swarm_id, steps1, repo)
        assert len(repo.list_actions(swarm_id)) == 1

        generate_actions_from_steps(swarm_id, steps2, repo)
        assert len(repo.list_actions(swarm_id)) == 2


# ──────────────────────────────────────────────
# Capability — Preflight & Readiness
# ──────────────────────────────────────────────


class TestPreflight:
    def test_preflight_with_seeded_tools(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="pf-swarm", description="test", created_by="tester",
        )
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="Write file",
            action_text="Create a file",
            action_type="file_create",
            target_path="output/test.md",
            action_status="defined",
        )
        report = run_preflight(swarm_id, repo)
        assert report.ready is True
        assert report.results[0].match_status == "supported"

    def test_preflight_unknown_action_type(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="unknown-swarm", description="test", created_by="tester",
        )
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="Mystery",
            action_text="Do something unknown",
            action_type="quantum_entanglement",
            action_status="defined",
        )
        report = run_preflight(swarm_id, repo)
        assert report.ready is False
        assert report.results[0].match_status == "requires_new_tool"

    def test_readiness_check(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="ready-swarm", description="test", created_by="tester",
        )
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="Write",
            action_text="Write a file",
            action_type="file_create",
            target_path="output/test.md",
            action_status="defined",
        )
        run_preflight(swarm_id, repo)
        readiness = check_readiness(swarm_id, repo)
        assert readiness.ready is True
        assert readiness.supported >= 1

    def test_readiness_with_pending_actions(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="pending-swarm", description="test", created_by="tester",
        )
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="Pending",
            action_text="Not yet checked",
            action_type="file_create",
            action_status="defined",
        )
        readiness = check_readiness(swarm_id, repo)
        assert readiness.ready is False
        assert readiness.pending == 1


# ──────────────────────────────────────────────
# Pipeline — Dependency Validation
# ──────────────────────────────────────────────


class TestDependencyValidation:
    def test_no_cycles_in_linear_graph(self):
        actions = [
            {"action_id": "a1", "action_name": "step1"},
            {"action_id": "a2", "action_name": "step2"},
            {"action_id": "a3", "action_name": "step3"},
        ]
        deps = [("a2", "a1"), ("a3", "a2")]
        errors = validate_dependencies(actions, deps)
        assert errors == []

    def test_cycle_detected(self):
        actions = [
            {"action_id": "a1", "action_name": "step1"},
            {"action_id": "a2", "action_name": "step2"},
        ]
        deps = [("a1", "a2"), ("a2", "a1")]
        errors = validate_dependencies(actions, deps)
        assert len(errors) > 0
        assert "Cycle" in errors[0]

    def test_empty_deps_no_error(self):
        actions = [{"action_id": "a1", "action_name": "step1"}]
        errors = validate_dependencies(actions, [])
        assert errors == []


# ──────────────────────────────────────────────
# Pipeline — Full Pipeline Run
# ──────────────────────────────────────────────


class TestPipelineRun:
    def test_pipeline_with_override_archetype(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="pipeline-swarm",
            description="test pipeline",
            created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate a weekly intelligence report with 3 sections",
            created_by="tester",
        )

        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Generate a weekly intelligence report with 3 sections",
            draft_id=draft_id,
            repo=repo,
            events=None,
            override_archetype="structured_report",
        )

        assert isinstance(result, PipelineResult)
        assert result.archetype_id.startswith("arch-")
        assert result.constraint_set_id.startswith("cset-")
        assert len(result.action_ids) > 0
        assert result.dependency_count >= 0
        assert "ready" in result.readiness_summary

    def test_pipeline_creates_actions_and_deps(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="pipeline-full",
            description="test",
            created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Build a code project with tests",
            created_by="tester",
        )

        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Build a code project with tests",
            draft_id=draft_id,
            repo=repo,
            events=None,
            override_archetype="code_generation",
        )

        actions = repo.list_actions(swarm_id)
        assert len(actions) > 0
        assert result.dependency_count >= 0


# ──────────────────────────────────────────────
# ACDS Inference Integration
# ──────────────────────────────────────────────


class _CannedInferenceProvider:
    """Real inference provider that returns canned LLM responses for testing."""

    def __init__(self, response: str | None):
        self._response = response
        self.calls: list[dict] = []

    def infer(self, prompt, *, task_type="generation", cognitive_grade="standard",
              process="definer", step="general"):
        self.calls.append({
            "prompt": prompt, "task_type": task_type,
            "cognitive_grade": cognitive_grade, "step": step,
        })
        return self._response


class TestACDSInferencePipeline:
    """Tests verifying the ACDS inference integration path."""

    def test_pipeline_with_inference_provider(self, repo):
        """LLM-based classification is used when an inference provider returns valid JSON."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="acds-test", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate a weekly intelligence report with 3 sections",
            created_by="tester",
        )

        mock = _CannedInferenceProvider(
            '{"swarm_archetype": "scheduled_structured_report", '
            '"complexity": "moderate", "confidence": 0.92, '
            '"reasoning": "Weekly recurring report with sections"}'
        )

        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Generate a weekly intelligence report with 3 sections",
            draft_id=draft_id,
            repo=repo,
            events=None,
            inference=mock,
        )

        assert isinstance(result, PipelineResult)
        assert len(result.action_ids) > 0
        # Verify inference was called for classification
        assert any(c["step"] == "archetype_classification" for c in mock.calls)

    def test_pipeline_falls_back_when_inference_returns_none(self, repo):
        """Pipeline uses rules when the inference provider returns None."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="fallback-test", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Build a code project with tests",
            created_by="tester",
        )

        mock = _CannedInferenceProvider(None)

        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Build a code project with tests",
            draft_id=draft_id,
            repo=repo,
            events=None,
            inference=mock,
            override_archetype="code_generation",
        )

        assert isinstance(result, PipelineResult)
        assert len(result.action_ids) > 0

    def test_pipeline_falls_back_on_invalid_llm_response(self, repo):
        """Pipeline uses rules when the LLM returns unparseable output."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="invalid-test", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate a weekly report",
            created_by="tester",
        )

        mock = _CannedInferenceProvider("This is not valid JSON at all")

        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Generate a weekly report",
            draft_id=draft_id,
            repo=repo,
            events=None,
            inference=mock,
        )

        assert isinstance(result, PipelineResult)
        assert len(result.action_ids) > 0


# ──────────────────────────────────────────────
# Tool Matching Wrapper
# ──────────────────────────────────────────────


class TestToolMatching:
    def test_create_tool_match_set(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="tm-swarm", description="test", created_by="tester",
        )
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="Write",
            action_text="Write a file",
            action_type="file_create",
            target_path="output/test.md",
            action_status="defined",
        )
        result = create_tool_match_set_for_swarm(repo, swarm_id)
        assert "preflight_report" in result
        assert result["preflight_report"]["ready"] is True
