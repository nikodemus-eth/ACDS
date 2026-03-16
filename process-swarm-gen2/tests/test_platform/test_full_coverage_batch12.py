"""Full coverage batch 12 — Final uncovered lines.

All tests use real objects — no mocks, no stubs, no fakes.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest


# ──────────────────────────────────────────────
# 1. runtime/pipeline/runner.py — _enforce_gate denial
# ──────────────────────────────────────────────


class TestPipelineRunnerGateDenial:
    """Cover _enforce_gate's ValueError raise when gate check fails."""

    def test_gate_denial_with_revoked_lease(self, tmp_path):
        """Process real proposal through validation+compilation, then call
        _enforce_gate with a real but revoked lease. All real objects — the
        proposal, validation, plan, and lease are all produced by real code.
        The only change: setting revocation_status to 'revoked' on the lease
        dict, which simulates a real-world lease revocation.
        """
        from tests.test_platform.test_full_coverage_batch11 import setup_m4_runtime

        setup_m4_runtime(tmp_path)

        from runtime.compiler.compiler import compile_plan
        from runtime.lease.lease_manager import (
            build_capabilities_from_plan,
            issue_lease,
        )
        from runtime.pipeline.runner import PipelineRunner
        from runtime.proposal.proposal_loader import load_proposal
        from runtime.validation.validator import validate_proposal

        keys_dir = tmp_path / "runtime" / "identity" / "keys"
        schemas_dir = tmp_path / "schemas"

        proposal = {
            "proposal_id": "gate-deny-001",
            "source": "internal",
            "intent": "Test gate denial via revoked lease",
            "target_paths": ["workspace/gate_test.txt"],
            "modifications": [
                {
                    "path": "workspace/gate_test.txt",
                    "operation": "create",
                    "content": "test",
                }
            ],
            "acceptance_tests": [
                {
                    "test_id": "gt1",
                    "command": "echo ok",
                    "expected_exit_code": 0,
                }
            ],
            "scope_boundary": {"allowed_paths": ["workspace/"]},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Write and load through real loader
        prop_file = tmp_path / "ingress" / "gate-deny-001.json"
        prop_file.write_text(json.dumps(proposal))
        loaded_proposal = load_proposal(prop_file, schemas_dir)

        # Real validation
        validation_result = validate_proposal(loaded_proposal, keys_dir, schemas_dir)
        assert validation_result["status"] == "passed"

        # Real compilation
        plan = compile_plan(loaded_proposal, validation_result, keys_dir, schemas_dir)

        # Real lease issuance
        granted, denied, scope = build_capabilities_from_plan(plan)
        lease = issue_lease(
            plan=plan,
            granted_capabilities=granted,
            denied_capabilities=denied,
            scope_constraints=scope,
            duration_seconds=300,
            node_id="m4-test-001",
            keys_dir=keys_dir,
            leases_dir=tmp_path / "artifacts" / "leases",
        )

        # Revoke the lease (simulates external revocation service)
        lease["revocation_status"] = "revoked"

        # Call _enforce_gate with the revoked lease — covers the raise path
        runner = PipelineRunner(str(tmp_path))
        with pytest.raises(ValueError, match="gate denied"):
            runner._enforce_gate(plan, validation_result, lease)


# ──────────────────────────────────────────────
# 2. swarm/definer/pipeline.py:773 — raise InvalidDependencies
# ──────────────────────────────────────────────


class TestPipelineInvalidDependenciesRaise:
    """Cover pipeline.py line 773 — raise InvalidDependencies through stage."""

    def test_circular_deps_raise_through_stage(self):
        """Set up DB with circular deps in action_table rows, trigger the stage."""
        from swarm.definer.pipeline import (
            InvalidDependencies,
            _stage_assign_dependencies,
        )

        db, repo, events = _make_db_repo_events()

        swarm_id = repo.create_swarm("dep-test", "Test", created_by="tester")

        # Create intent chain (needed for action table FK)
        draft_id = repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text="circular dep test",
            created_by="tester",
            revision_index=0,
        )
        restatement_id = repo.create_restatement(
            draft_id=draft_id,
            summary="Test",
            structured_steps=[{"op": "test"}],
        )
        acceptance_id = repo.accept_intent(
            restatement_id=restatement_id,
            accepted_by="tester",
            mode="explicit_button",
        )

        # Create action table with circular dependencies:
        # step 1 depends on step 3, step 2 on step 1, step 3 on step 2
        repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=[
                {"step": 1, "verb": "collect", "object": "data",
                 "dependencies": [3]},
                {"step": 2, "verb": "analyze", "object": "data",
                 "dependencies": [1]},
                {"step": 3, "verb": "report", "object": "results",
                 "dependencies": [2]},
            ],
            status="accepted",
        )

        # Create action records matching the action table steps
        for i, (verb, obj) in enumerate([
            ("collect", "data"),
            ("analyze", "data"),
            ("report", "results"),
        ]):
            repo.create_action(
                swarm_id=swarm_id,
                action_name=verb,
                action_text=f"{verb} {obj}",
                action_type=verb,
                target_path=f"workspace/{verb}.txt",
                step_order=i,
            )

        with pytest.raises(InvalidDependencies):
            _stage_assign_dependencies(
                swarm_id=swarm_id,
                archetype_name="custom",
                repo=repo,
                events=events,
                pipeline_events=[],
            )

        db.close()


# ──────────────────────────────────────────────
# 3. swarm/registry/database.py:740 — integrity_check non-ok rows
# ──────────────────────────────────────────────


class TestDatabaseIntegrityNonOkRows:
    """Cover database.py line 740 — integrity_check returns non-ok rows."""

    def test_index_corruption_produces_non_ok_rows(self, tmp_path):
        """Corrupt an index page so integrity_check returns error rows without raising."""
        from swarm.registry.database import RegistryDatabase

        db_path = tmp_path / "test.db"

        # Create DB with indexed data, then corrupt a byte in the index area
        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("CREATE TABLE t1 (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
        conn.execute("CREATE INDEX idx_name ON t1(name)")
        for i in range(50):
            conn.execute("INSERT INTO t1 VALUES (?, ?)", (i, f"name_{i:05d}"))
        conn.commit()
        conn.close()

        # Flip a byte in the last quarter of the file (index pages)
        raw = bytearray(db_path.read_bytes())
        target = len(raw) - 500
        raw[target] = raw[target] ^ 0xFF
        db_path.write_bytes(bytes(raw))

        # Open with raw connection
        db = RegistryDatabase(str(db_path))
        db.conn = sqlite3.connect(str(db_path))

        errors = db.verify_integrity()
        assert len(errors) > 0, "Expected integrity errors from index corruption"
        assert any("missing" in e.lower() or "row" in e.lower() for e in errors)
        db.close()


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────


def _make_db_repo_events():
    from swarm.events.recorder import EventRecorder
    from swarm.registry.database import RegistryDatabase
    from swarm.registry.repository import SwarmRepository

    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    repo = SwarmRepository(db)
    events = EventRecorder(repo)
    return db, repo, events
