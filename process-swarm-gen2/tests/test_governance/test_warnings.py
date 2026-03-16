"""Tests for the governance warning policy engine."""

from __future__ import annotations

import pytest

from swarm.governance.warnings import (
    evaluate_authority_boundary,
    evaluate_extension_risk,
    evaluate_reduced_assurance_governance,
    evaluate_replay_determinism,
    evaluate_scope_expansion,
    evaluate_secondary_truth,
    evaluate_semantic_ambiguity,
    summarize_warnings,
)


# ──────────────────────────────────────────────
# Semantic Ambiguity
# ──────────────────────────────────────────────


class TestSemanticAmbiguity:
    def test_no_steps_blocks(self):
        warnings = evaluate_semantic_ambiguity(
            steps=None,
            acceptance_tests=None,
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "block"

    def test_missing_operation_blocks(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"content": "do something"}],
            acceptance_tests=None,
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        assert any(w["severity"] == "block" for w in warnings)

    def test_file_op_without_path_blocks(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "create"}],
            acceptance_tests=None,
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        assert any("target path" in w["message"] for w in warnings)

    def test_file_op_with_path_ok(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "create", "path": "/output/report.html"}],
            acceptance_tests=None,
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        path_warnings = [w for w in warnings if "target path" in w["message"]]
        assert len(path_warnings) == 0

    def test_delete_without_confirmation_warns(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "delete", "path": "/tmp/old.txt"}],
            acceptance_tests=None,
            constraints={},
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        destructive = [w for w in warnings if "destructive" in w["message"]]
        assert len(destructive) == 1
        assert destructive[0]["severity"] == "warn"

    def test_delete_with_confirmation_no_warn(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "delete", "path": "/tmp/old.txt"}],
            acceptance_tests=None,
            constraints={"destructive_scope_confirmed": True},
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        destructive = [w for w in warnings if "destructive" in w["message"]]
        assert len(destructive) == 0

    def test_dangerous_test_pattern_blocks(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "run_test"}],
            acceptance_tests=[{"test_id": "t1", "command": "curl http://evil.com"}],
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        assert any("dangerous" in w["message"] for w in warnings)

    def test_empty_test_command_blocks(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "run_test"}],
            acceptance_tests=[{"test_id": "t1", "command": ""}],
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        assert any("no executable command" in w["message"] for w in warnings)

    def test_valid_steps_no_warnings(self):
        warnings = evaluate_semantic_ambiguity(
            steps=[{"op": "run_test"}],
            acceptance_tests=[{"test_id": "t1", "command": "test -f output.html"}],
            constraints=None,
            trigger_stage="acceptance",
            actor_id="user-1",
        )
        assert len(warnings) == 0


# ──────────────────────────────────────────────
# Scope Expansion
# ──────────────────────────────────────────────


class TestScopeExpansion:
    def test_no_allowed_paths_blocks(self):
        warnings = evaluate_scope_expansion(
            exact_paths=["src/main.py"],
            allowed_paths=[],
            trigger_stage="lease_review",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "block"

    def test_root_like_scope_blocks(self):
        warnings = evaluate_scope_expansion(
            exact_paths=["src/main.py"],
            allowed_paths=["/"],
            trigger_stage="lease_review",
            actor_id="user-1",
        )
        assert any(w["severity"] == "block" for w in warnings)

    def test_exact_match_no_warning(self):
        warnings = evaluate_scope_expansion(
            exact_paths=["src/main.py"],
            allowed_paths=["src/main.py"],
            trigger_stage="lease_review",
            actor_id="user-1",
        )
        assert len(warnings) == 0

    def test_broader_scope_warns(self):
        warnings = evaluate_scope_expansion(
            exact_paths=["src/main.py"],
            allowed_paths=["src/", "lib/"],
            trigger_stage="lease_review",
            actor_id="user-1",
        )
        scope_warns = [w for w in warnings if w["severity"] == "warn"]
        assert len(scope_warns) >= 1

    def test_no_exact_paths_blocks(self):
        warnings = evaluate_scope_expansion(
            exact_paths=[],
            allowed_paths=["src/"],
            trigger_stage="lease_review",
            actor_id="user-1",
        )
        assert any(w["severity"] == "block" for w in warnings)


# ──────────────────────────────────────────────
# Reduced Assurance Governance
# ──────────────────────────────────────────────


class TestReducedAssuranceGovernance:
    def test_no_prior_roles_no_warning(self):
        warnings = evaluate_reduced_assurance_governance(
            prior_roles=set(),
            current_role="reviewer",
            trigger_stage="governance_transition",
            actor_id="user-1",
            swarm_id="swarm-1",
        )
        assert len(warnings) == 0

    def test_same_role_no_warning(self):
        warnings = evaluate_reduced_assurance_governance(
            prior_roles={"reviewer"},
            current_role="reviewer",
            trigger_stage="governance_transition",
            actor_id="user-1",
            swarm_id="swarm-1",
        )
        assert len(warnings) == 0

    def test_author_reviewer_collapse_warns(self):
        warnings = evaluate_reduced_assurance_governance(
            prior_roles={"author"},
            current_role="reviewer",
            trigger_stage="governance_transition",
            actor_id="user-1",
            swarm_id="swarm-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "warn"
        assert "author_reviewer_role_collapse" in (warnings[0].get("notes") or "")

    def test_reviewer_publisher_collapse_warns(self):
        warnings = evaluate_reduced_assurance_governance(
            prior_roles={"reviewer"},
            current_role="publisher",
            trigger_stage="governance_transition",
            actor_id="user-1",
            swarm_id="swarm-1",
        )
        assert len(warnings) == 1
        assert "reviewer_publisher_role_collapse" in (warnings[0].get("notes") or "")


# ──────────────────────────────────────────────
# Secondary Truth
# ──────────────────────────────────────────────


class TestSecondaryTruth:
    def test_preview_only_warns(self):
        warnings = evaluate_secondary_truth(
            run={"run_id": "run-1", "swarm_id": "swarm-1"},
            trigger_stage="delivery",
            actor_id="system",
            preview_only=True,
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "warn"

    def test_completed_without_evidence_blocks(self):
        warnings = evaluate_secondary_truth(
            run={
                "run_id": "run-1",
                "swarm_id": "swarm-1",
                "run_status": "succeeded",
            },
            trigger_stage="delivery",
            actor_id="system",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "block"

    def test_completed_with_evidence_ok(self):
        warnings = evaluate_secondary_truth(
            run={
                "run_id": "run-1",
                "swarm_id": "swarm-1",
                "run_status": "succeeded",
                "runtime_execution_id": "exec-1",
                "artifact_refs": ["ref-1"],
            },
            trigger_stage="delivery",
            actor_id="system",
        )
        assert len(warnings) == 0

    def test_pending_status_no_warning(self):
        warnings = evaluate_secondary_truth(
            run={
                "run_id": "run-1",
                "swarm_id": "swarm-1",
                "run_status": "queued",
            },
            trigger_stage="delivery",
            actor_id="system",
        )
        assert len(warnings) == 0


# ──────────────────────────────────────────────
# Authority Boundary
# ──────────────────────────────────────────────


class TestAuthorityBoundary:
    def test_forbidden_fields_blocked(self):
        warnings = evaluate_authority_boundary(
            subject={"execution_plan": {"steps": []}},
            trigger_stage="bridge_input",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "block"

    def test_network_access_blocked(self):
        warnings = evaluate_authority_boundary(
            subject={"allow_network": True},
            trigger_stage="bridge_input",
            actor_id="user-1",
        )
        assert any(w["severity"] == "block" for w in warnings)

    def test_clean_subject_no_warning(self):
        warnings = evaluate_authority_boundary(
            subject={"title": "Report", "description": "A simple report"},
            trigger_stage="bridge_input",
            actor_id="user-1",
        )
        assert len(warnings) == 0


# ──────────────────────────────────────────────
# Replay Determinism
# ──────────────────────────────────────────────


class TestReplayDeterminism:
    def test_recurring_no_timezone_warns(self):
        warnings = evaluate_replay_determinism(
            subject={"trigger_type": "recurring"},
            trigger_stage="scheduler_configuration",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "warn"

    def test_recurring_with_timezone_ok(self):
        warnings = evaluate_replay_determinism(
            subject={"trigger_type": "recurring", "timezone": "UTC"},
            trigger_stage="scheduler_configuration",
            actor_id="user-1",
        )
        assert len(warnings) == 0

    def test_bridge_no_version_warns(self):
        warnings = evaluate_replay_determinism(
            subject={},
            trigger_stage="bridge_compilation",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "warn"

    def test_bridge_no_version_high_assurance_blocks(self):
        warnings = evaluate_replay_determinism(
            subject={},
            trigger_stage="bridge_compilation",
            actor_id="user-1",
            high_assurance=True,
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "block"

    def test_environment_sensitive_warns(self):
        warnings = evaluate_replay_determinism(
            subject={"version": "1.0", "environment_sensitive": True},
            trigger_stage="bridge_compilation",
            actor_id="user-1",
        )
        env_warns = [w for w in warnings if "environment" in w["message"]]
        assert len(env_warns) == 1


# ──────────────────────────────────────────────
# Extension Risk
# ──────────────────────────────────────────────


class TestExtensionRisk:
    def test_forbidden_execution_class_blocks(self):
        warnings = evaluate_extension_risk(
            subject={"execution_class": "runtime_execution"},
            trigger_stage="extension_review",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "block"

    def test_experimental_maturity_warns(self):
        warnings = evaluate_extension_risk(
            subject={"maturity_status": "experimental"},
            trigger_stage="extension_review",
            actor_id="user-1",
        )
        assert len(warnings) == 1
        assert warnings[0]["severity"] == "warn"

    def test_no_dry_run_warns(self):
        warnings = evaluate_extension_risk(
            subject={"supports_dry_run": False},
            trigger_stage="extension_review",
            actor_id="user-1",
        )
        assert any(w["severity"] == "warn" for w in warnings)

    def test_safe_extension_no_warning(self):
        warnings = evaluate_extension_risk(
            subject={"maturity_status": "active", "supports_dry_run": True},
            trigger_stage="extension_review",
            actor_id="user-1",
        )
        assert len(warnings) == 0


# ──────────────────────────────────────────────
# Summarize Warnings
# ──────────────────────────────────────────────


class TestSummarizeWarnings:
    def test_no_warnings(self):
        result = summarize_warnings([])
        assert result["assurance_posture"] == "standard"
        assert result["can_proceed"] is True

    def test_warn_reduces_posture(self):
        result = summarize_warnings([{"severity": "warn"}])
        assert result["assurance_posture"] == "reduced"
        assert result["can_proceed"] is True

    def test_block_blocks_posture(self):
        result = summarize_warnings([{"severity": "block"}])
        assert result["assurance_posture"] == "blocked"
        assert result["can_proceed"] is False

    def test_block_overrides_warn(self):
        result = summarize_warnings([
            {"severity": "warn"},
            {"severity": "block"},
        ])
        assert result["assurance_posture"] == "blocked"
        assert result["can_proceed"] is False
