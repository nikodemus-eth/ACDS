"""Tests for the Swarm Registry database layer."""

from __future__ import annotations

import sqlite3

import pytest

from swarm.registry.database import RegistryDatabase


@pytest.fixture
def db():
    """Provide a connected, migrated in-memory database."""
    database = RegistryDatabase(":memory:")
    database.connect()
    database.migrate()
    yield database
    database.close()


class TestConnection:
    def test_connect_creates_connection(self):
        db = RegistryDatabase(":memory:")
        db.connect()
        assert db.conn is not None
        db.close()

    def test_close_clears_connection(self):
        db = RegistryDatabase(":memory:")
        db.connect()
        db.close()
        assert db.conn is None

    def test_wal_mode_enabled(self):
        db = RegistryDatabase(":memory:")
        db.connect()
        mode = db.conn.execute("PRAGMA journal_mode").fetchone()[0]
        # In-memory databases use "memory" mode, but WAL is set for file DBs
        assert mode in ("wal", "memory")
        db.close()

    def test_foreign_keys_enabled(self):
        db = RegistryDatabase(":memory:")
        db.connect()
        fk = db.conn.execute("PRAGMA foreign_keys").fetchone()[0]
        assert fk == 1
        db.close()

    def test_row_factory_set(self):
        db = RegistryDatabase(":memory:")
        db.connect()
        assert db.conn.row_factory == sqlite3.Row
        db.close()

    def test_rejects_symlink(self, tmp_path):
        real_db = tmp_path / "real.db"
        real_db.touch()
        link = tmp_path / "link.db"
        link.symlink_to(real_db)
        db = RegistryDatabase(link)
        with pytest.raises(RuntimeError, match="symlink"):
            db.connect()

    def test_rejects_missing_parent(self, tmp_path):
        db = RegistryDatabase(tmp_path / "nonexistent" / "db.sqlite")
        with pytest.raises(RuntimeError, match="does not exist"):
            db.connect()


class TestMigration:
    def test_creates_all_tables(self, db):
        tables = {
            row[0]
            for row in db.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        expected = {
            "swarms",
            "intent_drafts",
            "intent_restatements",
            "intent_acceptances",
            "behavior_sequences",
            "swarm_schedules",
            "swarm_deliveries",
            "swarm_runs",
            "delivery_receipts",
            "swarm_events",
            "tool_registry",
            "swarm_actions",
            "swarm_action_dependencies",
            "action_tool_readiness",
            "tool_scope_rules",
            "proposed_tools",
            "run_action_results",
            "artifact_refs",
            "intent_archetypes",
            "constraint_sets",
            "action_table_acceptances",
            "governance_warning_records",
            "reduced_assurance_governance_events",
            "intent_clarifications",
            "action_tables",
            "archetype_classifications",
            "tool_match_sets",
            "capability_families",
            "tool_capability_family_bindings",
            "recipient_profiles",
        }
        assert expected.issubset(tables)

    def test_migrate_is_idempotent(self, db):
        db.migrate()
        db.migrate()
        tables = db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        assert len(tables) >= 30

    def test_creates_indexes(self, db):
        indexes = {
            row[0]
            for row in db.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
            ).fetchall()
        }
        assert "idx_swarms_status" in indexes
        assert "idx_runs_swarm" in indexes
        assert "idx_events_type" in indexes
        assert "idx_actions_swarm_order" in indexes

    def test_ensure_column_adds_missing(self, db):
        assert not db._column_exists("swarms", "test_col")
        db._ensure_column("swarms", "test_col", "TEXT")
        assert db._column_exists("swarms", "test_col")

    def test_ensure_column_idempotent(self, db):
        db._ensure_column("swarms", "test_col", "TEXT")
        db._ensure_column("swarms", "test_col", "TEXT")
        assert db._column_exists("swarms", "test_col")


class TestForeignKeys:
    def test_fk_enforced_on_insert(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO intent_drafts
                   (draft_id, swarm_id, raw_intent_text, revision_index,
                    status, created_by, created_at)
                   VALUES ('d1', 'nonexistent', 'text', 0, 'draft', 'user', '2026-01-01')"""
            )

    def test_fk_enforced_on_runs(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO swarm_runs
                   (run_id, swarm_id, trigger_source, run_status,
                    delivery_status, triggered_at)
                   VALUES ('r1', 'nonexistent', 'manual', 'queued',
                           'not_applicable', '2026-01-01')"""
            )

    def test_self_dependency_blocked(self, db):
        db.conn.execute(
            """INSERT INTO swarms
               (swarm_id, swarm_name, lifecycle_status, created_by,
                created_at, updated_at)
               VALUES ('s1', 'test', 'drafting', 'user', '2026-01-01', '2026-01-01')"""
        )
        db.conn.execute(
            """INSERT INTO swarm_actions
               (action_id, swarm_id, step_order, action_name, action_text,
                action_status, requires_user_confirmation, created_at, updated_at)
               VALUES ('a1', 's1', 1, 'act', 'text', 'draft', 0, '2026-01-01', '2026-01-01')"""
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO swarm_action_dependencies
                   (dependency_id, swarm_id, action_id, depends_on_action_id)
                   VALUES ('dep1', 's1', 'a1', 'a1')"""
            )


class TestTransaction:
    def test_commit_on_success(self, db):
        with db.transaction():
            db.conn.execute(
                """INSERT INTO swarms
                   (swarm_id, swarm_name, lifecycle_status, created_by,
                    created_at, updated_at)
                   VALUES ('s1', 'test', 'drafting', 'user', '2026-01-01', '2026-01-01')"""
            )
        row = db.conn.execute("SELECT * FROM swarms WHERE swarm_id = 's1'").fetchone()
        assert row is not None

    def test_rollback_on_error(self, db):
        try:
            with db.transaction():
                db.conn.execute(
                    """INSERT INTO swarms
                       (swarm_id, swarm_name, lifecycle_status, created_by,
                        created_at, updated_at)
                       VALUES ('s2', 'test', 'drafting', 'user', '2026-01-01', '2026-01-01')"""
                )
                raise ValueError("Forced error")
        except ValueError:
            pass
        row = db.conn.execute("SELECT * FROM swarms WHERE swarm_id = 's2'").fetchone()
        assert row is None

    def test_requires_connection(self):
        db = RegistryDatabase(":memory:")
        with pytest.raises(RuntimeError, match="not connected"):
            with db.transaction():
                pass


class TestIntegrity:
    def test_verify_integrity_ok(self, db):
        errors = db.verify_integrity()
        assert errors == []

    def test_verify_referential_consistency_empty(self, db):
        violations = db.verify_referential_consistency()
        assert violations == []

    def test_verify_requires_connection(self):
        db = RegistryDatabase(":memory:")
        with pytest.raises(RuntimeError, match="not connected"):
            db.verify_integrity()


class TestCheckConstraints:
    def test_tool_maturity_status_constraint(self, db):
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO tool_registry
                   (tool_id, tool_name, description, maturity_status,
                    supports_dry_run, created_at, updated_at)
                   VALUES ('t1', 'tool', 'desc', 'INVALID', 0, '2026-01-01', '2026-01-01')"""
            )

    def test_action_status_constraint(self, db):
        db.conn.execute(
            """INSERT INTO swarms
               (swarm_id, swarm_name, lifecycle_status, created_by,
                created_at, updated_at)
               VALUES ('s1', 'test', 'drafting', 'user', '2026-01-01', '2026-01-01')"""
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO swarm_actions
                   (action_id, swarm_id, step_order, action_name, action_text,
                    action_status, requires_user_confirmation, created_at, updated_at)
                   VALUES ('a1', 's1', 1, 'act', 'text', 'INVALID', 0, '2026-01-01', '2026-01-01')"""
            )

    def test_unique_step_order_per_swarm(self, db):
        db.conn.execute(
            """INSERT INTO swarms
               (swarm_id, swarm_name, lifecycle_status, created_by,
                created_at, updated_at)
               VALUES ('s1', 'test', 'drafting', 'user', '2026-01-01', '2026-01-01')"""
        )
        db.conn.execute(
            """INSERT INTO swarm_actions
               (action_id, swarm_id, step_order, action_name, action_text,
                action_status, requires_user_confirmation, created_at, updated_at)
               VALUES ('a1', 's1', 1, 'act1', 'text', 'draft', 0, '2026-01-01', '2026-01-01')"""
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO swarm_actions
                   (action_id, swarm_id, step_order, action_name, action_text,
                    action_status, requires_user_confirmation, created_at, updated_at)
                   VALUES ('a2', 's1', 1, 'act2', 'text', 'draft', 0, '2026-01-01', '2026-01-01')"""
            )

    def test_unique_tool_name(self, db):
        db.conn.execute(
            """INSERT INTO tool_registry
               (tool_id, tool_name, description, maturity_status,
                supports_dry_run, created_at, updated_at)
               VALUES ('t1', 'unique_tool', 'desc', 'active', 0, '2026-01-01', '2026-01-01')"""
        )
        with pytest.raises(sqlite3.IntegrityError):
            db.conn.execute(
                """INSERT INTO tool_registry
                   (tool_id, tool_name, description, maturity_status,
                    supports_dry_run, created_at, updated_at)
                   VALUES ('t2', 'unique_tool', 'desc2', 'active', 0, '2026-01-01', '2026-01-01')"""
            )
