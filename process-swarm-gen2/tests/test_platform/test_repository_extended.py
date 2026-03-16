"""Tests for extended Swarm Registry repository operations."""

from __future__ import annotations

import sqlite3

import pytest

from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def repo():
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    r = SwarmRepository(db)
    yield r
    db.close()


# ──────────────────────────────────────────────
# Tool Registry
# ──────────────────────────────────────────────


class TestToolRegistry:
    def test_create_tool(self, repo):
        tid = repo.create_tool("source_collector", "Collects sources")
        assert tid.startswith("tool-")

    def test_get_tool(self, repo):
        tid = repo.create_tool("source_collector", "Collects sources")
        tool = repo.get_tool(tid)
        assert tool["tool_name"] == "source_collector"
        assert tool["maturity_status"] == "active"

    def test_get_tool_by_name(self, repo):
        repo.create_tool("source_collector", "Collects sources")
        tool = repo.get_tool_by_name("source_collector")
        assert tool is not None

    def test_list_tools(self, repo):
        repo.create_tool("tool_a", "A")
        repo.create_tool("tool_b", "B")
        tools = repo.list_tools()
        assert len(tools) == 2

    def test_list_tools_by_status(self, repo):
        repo.create_tool("tool_a", "A", maturity_status="active")
        repo.create_tool("tool_b", "B", maturity_status="experimental")
        active = repo.list_tools(status="active")
        assert len(active) == 1

    def test_update_tool(self, repo):
        tid = repo.create_tool("tool_a", "A")
        repo.update_tool(tid, description="Updated A")
        tool = repo.get_tool(tid)
        assert tool["description"] == "Updated A"

    def test_unique_name_enforced(self, repo):
        repo.create_tool("unique_name", "A")
        with pytest.raises(sqlite3.IntegrityError):
            repo.create_tool("unique_name", "B")


# ──────────────────────────────────────────────
# Swarm Actions
# ──────────────────────────────────────────────


class TestSwarmActions:
    def test_create_action(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "Collect", "Collect data")
        assert aid.startswith("act-")

    def test_get_action(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "Collect", "Collect data")
        act = repo.get_action(aid)
        assert act["action_name"] == "Collect"
        assert act["action_status"] == "draft"

    def test_list_actions_ordered(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_action(sid, 2, "Second", "text")
        repo.create_action(sid, 1, "First", "text")
        actions = repo.list_actions(sid)
        assert actions[0]["action_name"] == "First"
        assert actions[1]["action_name"] == "Second"

    def test_update_action(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "Collect", "text")
        repo.update_action(aid, action_status="supported")
        act = repo.get_action(aid)
        assert act["action_status"] == "supported"

    def test_delete_actions_for_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_action(sid, 1, "A", "text")
        repo.create_action(sid, 2, "B", "text")
        deleted = repo.delete_actions_for_swarm(sid)
        assert deleted == 2
        assert repo.list_actions(sid) == []


# ──────────────────────────────────────────────
# Action Dependencies
# ──────────────────────────────────────────────


class TestActionDependencies:
    def test_create_dependency(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        a1 = repo.create_action(sid, 1, "First", "text")
        a2 = repo.create_action(sid, 2, "Second", "text")
        dep = repo.create_action_dependency(sid, a2, a1)
        assert dep.startswith("dep-")

    def test_list_dependencies(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        a1 = repo.create_action(sid, 1, "First", "text")
        a2 = repo.create_action(sid, 2, "Second", "text")
        repo.create_action_dependency(sid, a2, a1)
        deps = repo.list_action_dependencies(a2)
        assert len(deps) == 1
        assert deps[0]["depends_on_action_id"] == a1

    def test_delete_dependencies_for_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        a1 = repo.create_action(sid, 1, "First", "text")
        a2 = repo.create_action(sid, 2, "Second", "text")
        repo.create_action_dependency(sid, a2, a1)
        deleted = repo.delete_dependencies_for_swarm(sid)
        assert deleted == 1


# ──────────────────────────────────────────────
# Action Tool Readiness
# ──────────────────────────────────────────────


class TestActionToolReadiness:
    def test_create_readiness(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "Collect", "text")
        tid = repo.create_tool("collector", "Collects data")
        rid = repo.create_readiness_check(
            aid, "supported", tool_id=tid, confidence_score=0.95,
        )
        assert rid.startswith("rdy-")

    def test_get_latest_readiness(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "Collect", "text")
        repo.create_readiness_check(aid, "ambiguous")
        repo.create_readiness_check(aid, "supported")
        latest = repo.get_latest_readiness(aid)
        assert latest["match_status"] == "supported"

    def test_list_readiness_for_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        a1 = repo.create_action(sid, 1, "First", "text")
        a2 = repo.create_action(sid, 2, "Second", "text")
        repo.create_readiness_check(a1, "supported")
        repo.create_readiness_check(a2, "unsupported")
        readiness = repo.list_readiness_for_swarm(sid)
        assert len(readiness) == 2

    def test_requires_new_tool_flag(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "New", "text")
        repo.create_readiness_check(aid, "requires_new_tool")
        r = repo.get_latest_readiness(aid)
        assert r["requires_new_tool"] == 1


# ──────────────────────────────────────────────
# Intent Archetypes
# ──────────────────────────────────────────────


class TestIntentArchetypes:
    def test_create_archetype(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "Build report", "u")
        aid = repo.create_intent_archetype(
            did, "structured_report", confidence=0.8, source="rules",
        )
        assert aid.startswith("arch-")

    def test_get_archetype(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "Build report", "u")
        aid = repo.create_intent_archetype(did, "structured_report")
        arch = repo.get_intent_archetype(aid)
        assert arch["swarm_archetype"] == "structured_report"

    def test_get_by_intent(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "Build report", "u")
        repo.create_intent_archetype(did, "structured_report")
        arch = repo.get_intent_archetype_by_intent(did)
        assert arch is not None


# ──────────────────────────────────────────────
# Constraint Sets
# ──────────────────────────────────────────────


class TestConstraintSets:
    def test_create_constraint_set(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        cid = repo.create_constraint_set(did, '{"scope": "local"}')
        assert cid.startswith("cset-")

    def test_get_constraint_set(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        cid = repo.create_constraint_set(
            did, '{"scope": "local"}',
            extraction_method="rules",
            resolution_state="complete",
        )
        cs = repo.get_constraint_set(cid)
        assert cs["extraction_method"] == "rules"

    def test_get_by_intent(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        repo.create_constraint_set(did, '{}')
        cs = repo.get_constraint_set_by_intent(did)
        assert cs is not None


# ──────────────────────────────────────────────
# Action Tables
# ──────────────────────────────────────────────


class TestActionTables:
    def _setup_acceptance(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(did, "Summary", [{}])
        aid = repo.accept_intent(rid, "reviewer")
        return sid, aid

    def test_create_action_table(self, repo):
        sid, aid = self._setup_acceptance(repo)
        atid = repo.create_action_table(sid, aid, [{"action": "build"}])
        assert atid.startswith("atable-")

    def test_get_action_table(self, repo):
        sid, aid = self._setup_acceptance(repo)
        atid = repo.create_action_table(sid, aid, [{"action": "build"}])
        at = repo.get_action_table(atid)
        assert at["status"] == "accepted"

    def test_get_latest_for_swarm(self, repo):
        sid, aid = self._setup_acceptance(repo)
        repo.create_action_table(sid, aid, [{"action": "v1"}])
        repo.create_action_table(sid, aid, [{"action": "v2"}])
        latest = repo.get_latest_action_table_for_swarm(sid)
        assert '"v2"' in latest["actions_json"]


# ──────────────────────────────────────────────
# Action Table Acceptances
# ──────────────────────────────────────────────


class TestActionTableAcceptances:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        acc_id = repo.create_action_table_acceptance(
            sid, "reviewer", 5, notes="LGTM",
        )
        assert acc_id.startswith("atacc-")
        acc = repo.get_action_table_acceptance(acc_id)
        assert acc["action_count"] == 5

    def test_get_by_swarm(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        repo.create_action_table_acceptance(sid, "reviewer", 3)
        acc = repo.get_action_table_acceptance_by_swarm(sid)
        assert acc is not None


# ──────────────────────────────────────────────
# Clarifications
# ──────────────────────────────────────────────


class TestClarifications:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        cid = repo.create_intent_clarification(
            sid, did, "ambiguity", "What format?", "system",
        )
        assert cid.startswith("clar-")
        c = repo.get_intent_clarification(cid)
        assert c["question_text"] == "What format?"

    def test_list_clarifications(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        repo.create_intent_clarification(sid, did, "ambiguity", "Q1?", "sys")
        repo.create_intent_clarification(sid, did, "missing", "Q2?", "sys")
        clars = repo.list_intent_clarifications(swarm_id=sid)
        assert len(clars) == 2


# ──────────────────────────────────────────────
# Archetype Classifications
# ──────────────────────────────────────────────


class TestArchetypeClassifications:
    def _setup(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(did, "Summary", [{}])
        aid = repo.accept_intent(rid, "r")
        atid = repo.create_action_table(sid, aid, [{}])
        return atid

    def test_create_and_get(self, repo):
        atid = self._setup(repo)
        cid = repo.create_archetype_classification(
            atid, "structured_report", 0.9, "classified",
        )
        assert cid.startswith("aclass-")
        c = repo.get_archetype_classification(cid)
        assert c["confidence"] == 0.9

    def test_get_latest_for_action_table(self, repo):
        atid = self._setup(repo)
        repo.create_archetype_classification(atid, None, 0.3, "candidate")
        repo.create_archetype_classification(
            atid, "structured_report", 0.9, "classified",
        )
        latest = repo.get_latest_archetype_classification_for_action_table(atid)
        assert latest["classification_state"] == "classified"


# ──────────────────────────────────────────────
# Tool Match Sets
# ──────────────────────────────────────────────


class TestToolMatchSets:
    def _setup(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        did = repo.create_intent_draft(sid, "text", "u")
        rid = repo.create_restatement(did, "Summary", [{}])
        aid = repo.accept_intent(rid, "r")
        return repo.create_action_table(sid, aid, [{}])

    def test_create_and_get(self, repo):
        atid = self._setup(repo)
        tmid = repo.create_tool_match_set(atid, [{"tool": "collector"}])
        assert tmid.startswith("tmatch-")
        tm = repo.get_tool_match_set(tmid)
        assert '"collector"' in tm["matches_json"]

    def test_get_latest_for_action_table(self, repo):
        atid = self._setup(repo)
        repo.create_tool_match_set(atid, [{"v": 1}])
        repo.create_tool_match_set(atid, [{"v": 2}])
        latest = repo.get_latest_tool_match_set_for_action_table(atid)
        assert '"v": 2' in latest["matches_json"]


# ──────────────────────────────────────────────
# Capability Families
# ──────────────────────────────────────────────


class TestCapabilityFamilies:
    def test_create_and_list(self, repo):
        repo.create_capability_family(
            "file_ops", "File operations", ["create", "read", "update", "delete"],
        )
        families = repo.list_capability_families()
        assert len(families) == 1
        assert families[0]["family_id"] == "file_ops"

    def test_bind_tool(self, repo):
        repo.create_capability_family("file_ops", "File ops", ["create"])
        tid = repo.create_tool("writer", "Writes files")
        bid = repo.bind_tool_to_capability_family(tid, "file_ops")
        assert bid.startswith("cfbind-")
        bindings = repo.list_tool_capability_family_bindings(tool_id=tid)
        assert len(bindings) == 1


# ──────────────────────────────────────────────
# Recipient Profiles
# ──────────────────────────────────────────────


class TestRecipientProfiles:
    def test_create_and_get(self, repo):
        pid = repo.create_recipient_profile(
            "team-leads", ["lead@example.com"], "admin", "lineage-1",
        )
        assert pid.startswith("rprof-")
        p = repo.get_recipient_profile(pid)
        assert p["to_addresses"] == ["lead@example.com"]

    def test_get_by_name(self, repo):
        repo.create_recipient_profile(
            "team-leads", ["a@b.com"], "admin", "lin-1",
        )
        p = repo.get_recipient_profile_by_name("team-leads")
        assert p is not None

    def test_list_profiles(self, repo):
        repo.create_recipient_profile("a", ["a@b.com"], "admin", "lin")
        repo.create_recipient_profile("b", ["b@c.com"], "admin", "lin")
        profiles = repo.list_recipient_profiles()
        assert len(profiles) == 2

    def test_update_profile(self, repo):
        pid = repo.create_recipient_profile(
            "team", ["a@b.com"], "admin", "lin",
        )
        result = repo.update_recipient_profile(
            pid, description="Updated",
        )
        assert result is True
        p = repo.get_recipient_profile(pid)
        assert p["description"] == "Updated"

    def test_delete_profile(self, repo):
        pid = repo.create_recipient_profile(
            "team", ["a@b.com"], "admin", "lin",
        )
        repo.delete_recipient_profile(pid)
        p = repo.get_recipient_profile(pid)
        assert p["enabled"] == 0


# ──────────────────────────────────────────────
# Governance Warning Records
# ──────────────────────────────────────────────


class TestGovernanceWarnings:
    def _make_warning(self, **overrides):
        base = {
            "warning_family": "scope_expansion",
            "severity": "warn",
            "trigger_stage": "compilation",
            "message": "Scope expanded beyond original intent",
            "boundary_at_risk": "scope_containment",
            "affected_artifact_refs": ["plan-1"],
            "operator_decision": "deferred",
            "decision_fingerprint": "fp-abc123",
            "actor_id": "user-1",
        }
        base.update(overrides)
        return base

    def test_create_and_get(self, repo):
        wid = repo.create_governance_warning_record(self._make_warning())
        assert wid.startswith("warn-")
        w = repo.get_governance_warning_record(wid)
        assert w["warning_family"] == "scope_expansion"
        assert w["affected_artifact_refs"] == ["plan-1"]

    def test_list_warnings(self, repo):
        repo.create_governance_warning_record(self._make_warning())
        repo.create_governance_warning_record(
            self._make_warning(warning_family="trust_boundary"),
        )
        warnings = repo.list_governance_warning_records()
        assert len(warnings) == 2

    def test_list_by_family(self, repo):
        repo.create_governance_warning_record(self._make_warning())
        repo.create_governance_warning_record(
            self._make_warning(warning_family="trust_boundary"),
        )
        filtered = repo.list_governance_warning_records(
            warning_family="scope_expansion",
        )
        assert len(filtered) == 1


# ──────────────────────────────────────────────
# Reduced Assurance Events
# ──────────────────────────────────────────────


class TestReducedAssuranceEvents:
    def _make_event(self, **overrides):
        base = {
            "governance_action_type": "skip_validation",
            "reduction_type": "validation_bypass",
            "assurance_posture_before": "full",
            "assurance_posture_after": "reduced",
            "reason_summary": "Emergency deployment",
            "affected_artifact_refs": ["plan-1"],
            "actor_id": "user-1",
        }
        base.update(overrides)
        return base

    def test_create_and_get(self, repo):
        eid = repo.create_reduced_assurance_governance_event(self._make_event())
        assert eid.startswith("raeg-")
        e = repo.get_reduced_assurance_governance_event(eid)
        assert e["reduction_type"] == "validation_bypass"
        assert e["affected_artifact_refs"] == ["plan-1"]

    def test_list_events(self, repo):
        repo.create_reduced_assurance_governance_event(self._make_event())
        events = repo.list_reduced_assurance_governance_events()
        assert len(events) == 1


# ──────────────────────────────────────────────
# Run Action Results & Artifact Refs
# ──────────────────────────────────────────────


class TestRunActionResults:
    def test_create_and_get(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        aid = repo.create_action(sid, 1, "Collect", "text")
        rid = repo.create_run(sid, "manual")
        rar_id = repo.create_run_action_result(
            rid, aid, 1, "completed",
        )
        assert rar_id.startswith("rar-")
        results = repo.get_run_action_results(rid)
        assert len(results) == 1
        assert results[0]["execution_status"] == "completed"

    def test_artifact_refs(self, repo):
        sid = repo.create_swarm("S", "d", "u")
        rid = repo.create_run(sid, "manual")
        aref_id = repo.create_artifact_ref(
            "swarm_run", rid, "execution_plan", "/artifacts/plan.json",
        )
        assert aref_id.startswith("aref-")
        refs = repo.get_artifact_refs("swarm_run", rid)
        assert len(refs) == 1


# ──────────────────────────────────────────────
# Actor Roles
# ──────────────────────────────────────────────


class TestActorRoles:
    def test_author_role(self, repo):
        sid = repo.create_swarm("S", "d", "user-1")
        roles = repo.get_actor_roles_for_swarm(sid, "user-1")
        assert "author" in roles

    def test_event_roles(self, repo):
        sid = repo.create_swarm("S", "d", "user-1")
        repo.record_event(
            sid, "review_completed", "user-2", "Reviewed",
            details={"actor_role": "reviewer"},
        )
        roles = repo.get_actor_roles_for_swarm(sid, "user-2")
        assert "reviewer" in roles
