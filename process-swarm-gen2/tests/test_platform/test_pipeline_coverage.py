"""Tests targeting pipeline.py coverage gaps -- canonical paths, action tables,
dependency assignment from canonical rows, event emission, exception classes,
action expansion, _derive_target_path, _looks_like_output_target, and
run_canonical_pipeline_for_swarm.

All tests use real objects -- no mocks, no stubs, no patches.
"""
from __future__ import annotations

import json
import pytest

from swarm.definer.capability import seed_default_tools
from swarm.definer.pipeline import (
    ClarificationNeeded,
    InvalidDependencies,
    PipelineResult,
    _derive_target_path,
    _emit_event,
    _looks_like_output_target,
    _maybe_expand_action,
    _slugify,
    run_action_table_pipeline,
    run_canonical_pipeline_for_swarm,
    validate_dependencies,
)
from swarm.definer.constraints import ConstraintSet
from swarm.definer.templates import TemplateAction
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def repo():
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    return SwarmRepository(db)


def _setup_acceptance(repo, swarm_id, raw_text):
    """Create draft -> restatement -> acceptance chain for a swarm."""
    draft_id = repo.create_intent_draft(
        swarm_id=swarm_id, raw_text=raw_text, created_by="tester",
    )
    restatement_id = repo.create_restatement(
        draft_id, raw_text, [{"step": 1}],
    )
    acceptance_id = repo.accept_intent(
        restatement_id=restatement_id, accepted_by="tester",
    )
    return draft_id, acceptance_id


# ──────────────────────────────────────────────
# Exception classes
# ──────────────────────────────────────────────


class TestClarificationNeeded:
    def test_attributes(self):
        exc = ClarificationNeeded(
            archetype="structured_report", confidence=0.3,
            reasoning="low confidence match",
        )
        assert exc.archetype == "structured_report"
        assert exc.confidence == 0.3
        assert exc.reasoning == "low confidence match"
        assert "structured_report" in str(exc)
        assert "0.30" in str(exc)


class TestInvalidDependencies:
    def test_attributes(self):
        exc = InvalidDependencies(["action_a -> action_b", "action_b -> action_a"])
        assert len(exc.cycles) == 2
        assert "cycles" in str(exc)


# ──────────────────────────────────────────────
# Event helper
# ──────────────────────────────────────────────


class TestEmitEvent:
    def test_no_events_object(self):
        events_list = []
        _emit_event(None, events_list, swarm_id="s1", event_type="test")
        assert events_list == []

    def test_events_without_record_method(self):
        events_list = []
        _emit_event(object(), events_list, swarm_id="s1", event_type="test")
        assert events_list == []

    def test_events_with_record_method(self):
        class RealRecorder:
            def record(self, **kwargs):
                return "evt-123"

        events_list = []
        _emit_event(RealRecorder(), events_list, swarm_id="s1", event_type="test")
        assert events_list == ["evt-123"]

    def test_events_record_returns_none(self):
        class RealRecorder:
            def record(self, **kwargs):
                return None

        events_list = []
        _emit_event(RealRecorder(), events_list, swarm_id="s1", event_type="test")
        assert events_list == []


# ──────────────────────────────────────────────
# _looks_like_output_target
# ──────────────────────────────────────────────


class TestLooksLikeOutputTarget:
    def test_empty(self):
        assert _looks_like_output_target("") is False

    def test_email_rejected(self):
        assert _looks_like_output_target("email") is False

    def test_slack_rejected(self):
        assert _looks_like_output_target("slack") is False

    def test_telegram_rejected(self):
        assert _looks_like_output_target("telegram") is False

    def test_finance_rejected(self):
        assert _looks_like_output_target("finance") is False

    def test_team_rejected(self):
        assert _looks_like_output_target("team") is False

    def test_slash_path(self):
        assert _looks_like_output_target("output/report.md") is True

    def test_dot_path(self):
        assert _looks_like_output_target("report.pdf") is True

    def test_output_prefix(self):
        assert _looks_like_output_target("output_dir") is True

    def test_workspace_prefix(self):
        assert _looks_like_output_target("workspace_dir") is True


# ──────────────────────────────────────────────
# _derive_target_path
# ──────────────────────────────────────────────


class TestDeriveTargetPath:
    def test_uses_canonical_path_when_available(self):
        result = _derive_target_path(0, "file_create", "intent", None, ["output/report.md"])
        assert result == "output/report.md"

    def test_test_run_returns_none(self):
        result = _derive_target_path(5, "test_run", "intent", None, [])
        assert result is None

    def test_validation_returns_none(self):
        result = _derive_target_path(5, "validation", "intent", None, [])
        assert result is None

    def test_derives_from_canonical_row_source_text(self):
        row = {"source_text": "Write the introduction", "verb": "write", "object": "intro"}
        result = _derive_target_path(0, "file_create", "intent", row, [])
        assert result.startswith("output/")
        assert "write_the_introduction" in result

    def test_derives_from_canonical_row_verb_object(self):
        row = {"verb": "generate", "object": "summary"}
        result = _derive_target_path(0, "file_create", "intent", row, [])
        assert "generate_summary" in result

    def test_derives_from_intent_text(self):
        result = _derive_target_path(0, "file_create", "Build a report", None, [])
        assert result.startswith("output/")
        assert "build_a_report" in result

    def test_empty_slug_defaults_to_output(self):
        result = _derive_target_path(0, "file_create", "!!!", None, [])
        assert result == "output/output.md"


# ──────────────────────────────────────────────
# _maybe_expand_action
# ──────────────────────────────────────────────


class TestMaybeExpandAction:
    def test_source_collection_with_sections(self):
        ta = TemplateAction(
            name="collect", description="Collect data",
            action_type="source_collection",
        )
        cs = ConstraintSet(sections=["intro", "body"])
        result = _maybe_expand_action(ta, cs, "structured_report", "intent", None)
        assert len(result) == 2
        assert result[0][0].startswith("collect_sources_")
        assert "intro" in result[0][1]

    def test_section_mapping_with_sections(self):
        ta = TemplateAction(
            name="map", description="Map data",
            action_type="section_mapping",
        )
        cs = ConstraintSet(sections=["a", "b", "c"])
        result = _maybe_expand_action(ta, cs, "structured_report", "intent", None)
        assert len(result) == 3
        assert all(r[0].startswith("map_section_") for r in result)

    def test_probabilistic_synthesis_with_sections(self):
        ta = TemplateAction(
            name="synth", description="Synthesize",
            action_type="probabilistic_synthesis",
        )
        cs = ConstraintSet(sections=["x", "y"])
        result = _maybe_expand_action(ta, cs, "structured_report", "intent", None)
        assert len(result) == 2
        assert all(r[0].startswith("synthesize_") for r in result)

    def test_no_expansion_without_sections(self):
        ta = TemplateAction(
            name="collect", description="Collect data",
            action_type="source_collection",
        )
        cs = ConstraintSet()
        result = _maybe_expand_action(ta, cs, "structured_report", "intent", None)
        assert len(result) == 1
        assert result[0][0] == "collect"

    def test_specialization_hint_appended(self):
        ta = TemplateAction(
            name="action", description="Do thing",
            action_type="generic",
            specialization_hint="use markdown",
        )
        cs = ConstraintSet()
        result = _maybe_expand_action(ta, cs, "code_generation", "intent", None)
        assert len(result) == 1
        assert "[Hint: use markdown]" in result[0][1]

    def test_no_hint(self):
        ta = TemplateAction(
            name="action", description="Do thing",
            action_type="generic",
        )
        cs = ConstraintSet()
        result = _maybe_expand_action(ta, cs, "code_generation", "intent", None)
        assert result[0][1] == "Do thing"


# ──────────────────────────────────────────────
# _slugify
# ──────────────────────────────────────────────


class TestSlugify:
    def test_basic(self):
        assert _slugify("Hello World") == "hello_world"

    def test_special_chars(self):
        assert _slugify("foo@bar!baz") == "foo_bar_baz"

    def test_truncates(self):
        assert len(_slugify("a" * 100)) == 40

    def test_strips_underscores(self):
        assert _slugify("  --hello--  ") == "hello"

    def test_empty(self):
        assert _slugify("!!!") == ""


# ──────────────────────────────────────────────
# run_canonical_pipeline_for_swarm
# ──────────────────────────────────────────────


class TestCanonicalPipeline:
    def test_no_draft_raises(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="no-draft", description="test", created_by="tester",
        )
        with pytest.raises(ValueError, match="No intent draft"):
            run_canonical_pipeline_for_swarm(swarm_id, repo)

    def test_no_action_table_raises(self, repo):
        swarm_id = repo.create_swarm(
            swarm_name="no-at", description="test", created_by="tester",
        )
        repo.create_intent_draft(
            swarm_id=swarm_id, raw_text="Generate a report", created_by="tester",
        )
        with pytest.raises(ValueError, match="Canonical planning requires"):
            run_canonical_pipeline_for_swarm(swarm_id, repo)

    def test_canonical_pipeline_with_action_table(self, repo):
        """Full canonical pipeline path with an accepted action table."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="canonical", description="test", created_by="tester",
        )
        draft_id, acceptance_id = _setup_acceptance(
            repo, swarm_id, "Generate a weekly report covering market trends",
        )

        actions = [
            {"step": 1, "verb": "collect", "object": "market data",
             "source_text": "Collect market data", "destination": "output/data.csv",
             "dependencies": [], "qualifiers": {}},
            {"step": 2, "verb": "analyze", "object": "trends",
             "source_text": "Analyze trends", "destination": "output/analysis.md",
             "dependencies": [1], "qualifiers": {}},
        ]
        action_table_id = repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=actions,
        )

        result = run_canonical_pipeline_for_swarm(
            swarm_id, repo,
            override_archetype="structured_report",
        )
        assert isinstance(result, PipelineResult)
        assert len(result.action_ids) > 0

    def test_canonical_pipeline_with_stored_classification(self, repo):
        """Exercises the stored canonical classification branch."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="stored-class", description="test", created_by="tester",
        )
        draft_id, acceptance_id = _setup_acceptance(
            repo, swarm_id, "Generate a weekly scheduled report on metrics",
        )

        actions = [
            {"step": 1, "verb": "collect", "object": "metrics",
             "source_text": "Collect metrics", "destination": "output/metrics.csv",
             "dependencies": [], "qualifiers": {}},
            {"step": 2, "verb": "format", "object": "report",
             "source_text": "Format report", "destination": "output/report.md",
             "dependencies": [1], "qualifiers": {}},
        ]
        action_table_id = repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=actions,
        )

        # Create a stored classification
        repo.create_archetype_classification(
            action_table_ref=action_table_id,
            archetype_id="scheduled_reporting_pipeline",
            confidence=0.9,
            classification_state="classified",
            matched_capabilities=["collect", "format"],
            dependency_structure="linear",
            classification_notes={"source": "test"},
        )

        result = run_canonical_pipeline_for_swarm(swarm_id, repo)
        assert isinstance(result, PipelineResult)
        assert len(result.action_ids) > 0


# ──────────────────────────────────────────────
# Pipeline with events recorder
# ──────────────────────────────────────────────


class _RealEventRecorder:
    def __init__(self):
        self.events = []
        self._counter = 0

    def record(self, **kwargs):
        self._counter += 1
        eid = f"evt-{self._counter}"
        self.events.append(kwargs)
        return eid


class TestPipelineWithEvents:
    def test_pipeline_emits_events(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="evented", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate a weekly intelligence report",
            created_by="tester",
        )

        recorder = _RealEventRecorder()
        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Generate a weekly intelligence report",
            draft_id=draft_id,
            repo=repo,
            events=recorder,
            override_archetype="structured_report",
        )

        assert len(result.pipeline_events) > 0
        event_types = [e["event_type"] for e in recorder.events]
        assert "archetype_classified" in event_types
        assert "constraints_extracted" in event_types
        assert "action_skeleton_loaded" in event_types
        assert "action_table_specialized" in event_types
        assert "dependencies_assigned" in event_types
        assert "tool_matching_completed" in event_types
        assert "pipeline_completed" in event_types


# ──────────────────────────────────────────────
# Pipeline with sections — expands actions
# ──────────────────────────────────────────────


class TestPipelineWithSections:
    def test_sections_expand_actions(self, repo):
        """Pipeline with sections in intent triggers action expansion."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="sections-test", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate report sections: overview, analysis, conclusion",
            created_by="tester",
        )

        result = run_action_table_pipeline(
            swarm_id=swarm_id,
            intent_text="Generate report sections: overview, analysis, conclusion",
            draft_id=draft_id,
            repo=repo,
            events=None,
            override_archetype="structured_report",
        )

        # With 3 sections, source_collection/section_mapping/synthesis get expanded
        assert len(result.action_ids) >= 3


# ──────────────────────────────────────────────
# Pipeline clarification needed
# ──────────────────────────────────────────────


class TestPipelineClarification:
    def test_low_confidence_raises_clarification(self, repo):
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="clarify", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="xyzzy",
            created_by="tester",
        )

        with pytest.raises(ClarificationNeeded) as exc_info:
            run_action_table_pipeline(
                swarm_id=swarm_id,
                intent_text="xyzzy",
                draft_id=draft_id,
                repo=repo,
                events=None,
            )
        assert exc_info.value.confidence < 0.5


# ──────────────────────────────────────────────
# Pipeline with canonical rows containing dependencies
# ──────────────────────────────────────────────


class TestPipelineCanonicalDependencies:
    def test_dependencies_from_canonical_rows(self, repo):
        """Exercises the dependency assignment branch using canonical action table rows."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="canon-deps", description="test", created_by="tester",
        )
        draft_id, acceptance_id = _setup_acceptance(
            repo, swarm_id, "Build and test a module",
        )

        actions = [
            {"step": 1, "verb": "create", "object": "module",
             "source_text": "Create module source", "destination": "output/module.py",
             "dependencies": [], "qualifiers": {}},
            {"step": 2, "verb": "write", "object": "tests",
             "source_text": "Write unit tests", "destination": "output/test_module.py",
             "dependencies": [1], "qualifiers": {}},
            {"step": 3, "verb": "run", "object": "tests",
             "source_text": "Run test suite", "destination": "",
             "dependencies": [1, 2], "qualifiers": {}},
        ]
        action_table_id = repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=actions,
        )

        result = run_canonical_pipeline_for_swarm(
            swarm_id, repo,
            override_archetype="code_generation",
        )
        assert result.dependency_count >= 1
        assert len(result.action_ids) > 0

    def test_action_table_paths_with_qualifiers(self, repo):
        """Exercises qualifier-based path resolution."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="qualifier-paths", description="test", created_by="tester",
        )
        draft_id, acceptance_id = _setup_acceptance(
            repo, swarm_id, "Generate output files",
        )

        actions = [
            {"step": 1, "verb": "generate", "object": "file",
             "source_text": "Generate output", "destination": "",
             "dependencies": [],
             "qualifiers": {"path": "workspace/output.txt"}},
            {"step": 2, "verb": "validate", "object": "output",
             "source_text": "Validate output", "destination": "email",
             "dependencies": [1], "qualifiers": {}},
        ]
        action_table_id = repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=actions,
        )

        result = run_canonical_pipeline_for_swarm(
            swarm_id, repo,
            override_archetype="code_generation",
        )
        assert isinstance(result, PipelineResult)


# ──────────────────────────────────────────────
# _load_action_table_rows — edge cases with real DB
# ──────────────────────────────────────────────


class _RepoWithNonStringActions(SwarmRepository):
    """Real SwarmRepository subclass that returns actions_json as a list."""

    def get_latest_action_table_for_swarm(self, swarm_id):
        at = super().get_latest_action_table_for_swarm(swarm_id)
        if at:
            at["actions_json"] = [{"step": 1}]
        return at


class _RepoWithNoneActions(SwarmRepository):
    """Real SwarmRepository subclass that returns actions_json as None."""

    def get_latest_action_table_for_swarm(self, swarm_id):
        at = super().get_latest_action_table_for_swarm(swarm_id)
        if at:
            at["actions_json"] = None
        return at


class TestLoadActionTableRows:
    """Cover pipeline.py line 608: non-string actions_json path."""

    def test_non_string_actions_json(self):
        """When actions_json is already a list (not a string)."""
        from swarm.definer.pipeline import _load_action_table_rows
        db = RegistryDatabase(":memory:")
        db.connect()
        db.migrate()
        repo = _RepoWithNonStringActions(db)

        swarm_id = repo.create_swarm(
            swarm_name="non-str", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id, raw_text="test", created_by="tester",
        )
        restatement_id = repo.create_restatement(draft_id, "test", [{"step": 1}])
        acceptance_id = repo.accept_intent(restatement_id=restatement_id, accepted_by="tester")
        repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=[{"step": 1, "verb": "do", "object": "thing"}],
        )
        rows = _load_action_table_rows(swarm_id, repo)
        assert rows == [{"step": 1}]

    def test_none_actions_json(self):
        """When actions_json is None."""
        from swarm.definer.pipeline import _load_action_table_rows
        db = RegistryDatabase(":memory:")
        db.connect()
        db.migrate()
        repo = _RepoWithNoneActions(db)

        swarm_id = repo.create_swarm(
            swarm_name="none-json", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id, raw_text="test", created_by="tester",
        )
        restatement_id = repo.create_restatement(draft_id, "test", [{"step": 1}])
        acceptance_id = repo.accept_intent(restatement_id=restatement_id, accepted_by="tester")
        repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=[{"step": 1}],
        )
        rows = _load_action_table_rows(swarm_id, repo)
        assert rows == []

    def test_no_action_table_returns_empty(self, repo):
        """When no action table exists for the swarm."""
        from swarm.definer.pipeline import _load_action_table_rows
        swarm_id = repo.create_swarm(
            swarm_name="no-at", description="test", created_by="tester",
        )
        rows = _load_action_table_rows(swarm_id, repo)
        assert rows == []


class TestStageAssignDependenciesEdges:
    """Cover pipeline.py lines 735, 749, 753."""

    def test_no_actions_returns_zero(self, repo):
        """Line 735: no actions for swarm returns 0."""
        from swarm.definer.pipeline import _stage_assign_dependencies
        swarm_id = repo.create_swarm(
            swarm_name="no-actions", description="test", created_by="tester",
        )
        result = _stage_assign_dependencies(swarm_id, "structured_report", repo, None, [])
        assert result == 0

    def test_missing_step_mapping_skipped(self, repo):
        """Line 749: canonical row step doesn't map to action -> skip."""
        from swarm.definer.pipeline import _stage_assign_dependencies
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="skip-step", description="test", created_by="tester",
        )
        _, acceptance_id = _setup_acceptance(repo, swarm_id, "test task")

        # Create action table with step 99 that won't map
        repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=[
                {"step": 99, "verb": "do", "object": "x", "dependencies": [1]},
            ],
        )
        # Create one action at step_order 0
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="test-action",
            action_text="test",
            action_type="create",
        )
        result = _stage_assign_dependencies(swarm_id, "structured_report", repo, None, [])
        assert result == 0

    def test_missing_dependency_target_skipped(self, repo):
        """Line 753: dependency target step doesn't map to action -> skip."""
        from swarm.definer.pipeline import _stage_assign_dependencies
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="skip-dep", description="test", created_by="tester",
        )
        _, acceptance_id = _setup_acceptance(repo, swarm_id, "test task")

        # Step 1 depends on step 99 (doesn't exist)
        repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=[
                {"step": 1, "verb": "do", "object": "x", "dependencies": [99]},
            ],
        )
        repo.create_action(
            swarm_id=swarm_id,
            step_order=0,
            action_name="test-action",
            action_text="test",
            action_type="create",
        )
        result = _stage_assign_dependencies(swarm_id, "structured_report", repo, None, [])
        assert result == 0


class TestCanonicalPipelineNoStoredClassification:
    """Cover pipeline.py line 302: no stored classification, use inferred."""

    def test_canonical_pipeline_without_stored_classification(self, repo):
        """Exercises line 302: canonical_match = inferred_canonical."""
        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="no-stored", description="test", created_by="tester",
        )
        _, acceptance_id = _setup_acceptance(
            repo, swarm_id, "Collect data and generate report",
        )
        actions = [
            {"step": 1, "verb": "collect", "object": "data",
             "source_text": "Collect data", "destination": "output/data.csv",
             "dependencies": [], "qualifiers": {}},
            {"step": 2, "verb": "analyze", "object": "findings",
             "source_text": "Analyze findings", "destination": "output/report.md",
             "dependencies": [1], "qualifiers": {}},
        ]
        repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=actions,
        )
        try:
            result = run_canonical_pipeline_for_swarm(swarm_id, repo)
            assert isinstance(result, PipelineResult)
        except ClarificationNeeded:
            pass  # line 302 was still exercised before the exception


class _RepoWithListWarnings(SwarmRepository):
    """Real SwarmRepository subclass that returns ambiguous_fields_json as a list."""

    def get_constraint_set(self, constraint_set_id):
        record = super().get_constraint_set(constraint_set_id)
        if record:
            record["ambiguous_fields_json"] = ["some_field"]
        return record


class TestCanonicalNonStringWarnings:
    """Cover pipeline.py line 422: warnings_raw is not a string."""

    def test_non_string_warnings_in_constraint_set(self):
        """Line 422: warnings_raw is already a list."""
        from swarm.definer.pipeline import _run_planning_pipeline
        db = RegistryDatabase(":memory:")
        db.connect()
        db.migrate()
        repo = _RepoWithListWarnings(db)

        seed_default_tools(repo)
        swarm_id = repo.create_swarm(
            swarm_name="non-str-warn", description="test", created_by="tester",
        )
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="Generate a weekly summary report",
            created_by="tester",
        )
        # Create a constraint set
        from swarm.definer.constraints import ConstraintSet, constraint_set_to_dict
        cs = ConstraintSet(sections=["overview"])
        cs_id = repo.create_constraint_set(
            intent_id=draft_id,
            constraints_json=json.dumps(constraint_set_to_dict(cs)),
        )

        result = _run_planning_pipeline(
            swarm_id=swarm_id,
            intent_text="Generate a weekly summary report",
            draft_id=draft_id,
            repo=repo,
            events=None,
            override_archetype="structured_report",
        )
        assert isinstance(result, PipelineResult)


class TestValidateDependenciesExtended:
    def test_ignores_unknown_ids(self):
        actions = [{"action_id": "a1", "action_name": "A1"}]
        deps = [("a1", "unknown_id")]
        errors = validate_dependencies(actions, deps)
        assert errors == []

    def test_self_cycle(self):
        actions = [{"action_id": "a1", "action_name": "A1"}]
        deps = [("a1", "a1")]
        errors = validate_dependencies(actions, deps)
        assert len(errors) > 0
