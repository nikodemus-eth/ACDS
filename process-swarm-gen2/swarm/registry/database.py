"""Swarm Registry SQLite database.

Manages the SQLite database for the Process Swarm platform,
including schema migration for all platform tables:
  Tables 1-10:  Original swarm lifecycle (intent, behavior, runs)
  Tables 11-18: Capability-aware layer (tools, actions, readiness)
  Tables 19-30: Action tables, archetypes, governance, recipients
"""

from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Union

logger = logging.getLogger(__name__)


class RegistryDatabase:
    """SQLite database manager for the Swarm Registry."""

    def __init__(self, db_path: Union[str, Path] = ":memory:"):
        self.db_path = str(db_path)
        self.conn: sqlite3.Connection | None = None

    def connect(self) -> None:
        if self.db_path != ":memory:":
            db_file = Path(self.db_path)
            if not db_file.parent.exists():
                raise RuntimeError(
                    f"DB directory does not exist: {db_file.parent}"
                )
            if db_file.exists() and db_file.is_symlink():
                raise RuntimeError(
                    f"DB path is a symlink (rejected): {db_file}"
                )

        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def close(self) -> None:
        if self.conn:
            self.conn.close()
            self.conn = None

    @contextmanager
    def transaction(self):
        if not self.conn:
            raise RuntimeError("Database not connected. Call connect() first.")
        try:
            yield self.conn
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise

    def migrate(self) -> None:
        if not self.conn:
            raise RuntimeError("Database not connected. Call connect() first.")

        cursor = self.conn.cursor()

        # Table 1: swarms
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarms (
                swarm_id            TEXT PRIMARY KEY,
                swarm_name          TEXT NOT NULL,
                description         TEXT,
                lifecycle_status    TEXT NOT NULL DEFAULT 'drafting',
                accepted_intent_id  TEXT,
                behavior_sequence_id TEXT,
                schedule_id         TEXT,
                delivery_id         TEXT,
                latest_run_id       TEXT,
                created_by          TEXT NOT NULL,
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            )
        """)

        # Table 2: intent_drafts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS intent_drafts (
                draft_id        TEXT PRIMARY KEY,
                swarm_id        TEXT NOT NULL,
                raw_intent_text TEXT NOT NULL,
                revision_index  INTEGER NOT NULL DEFAULT 0,
                parent_draft_id TEXT,
                session_id      TEXT,
                status          TEXT NOT NULL DEFAULT 'draft',
                created_by      TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id)
            )
        """)

        # Table 3: intent_restatements
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS intent_restatements (
                restatement_id          TEXT PRIMARY KEY,
                draft_id                TEXT NOT NULL,
                human_readable_summary  TEXT NOT NULL,
                structured_steps_json   TEXT,
                expected_outputs_json   TEXT,
                inferred_constraints_json TEXT,
                status                  TEXT NOT NULL DEFAULT 'proposed',
                generated_at            TEXT NOT NULL,
                FOREIGN KEY (draft_id) REFERENCES intent_drafts(draft_id)
            )
        """)
        self._ensure_column("intent_restatements", "extracted_actions_json", "TEXT")
        self._ensure_column("intent_restatements", "dependency_graph_json", "TEXT")
        self._ensure_column("intent_restatements", "unresolved_issues_json", "TEXT")
        self._ensure_column("intent_restatements", "clarification_history_json", "TEXT")

        # Table 4: intent_acceptances
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS intent_acceptances (
                acceptance_id   TEXT PRIMARY KEY,
                restatement_id  TEXT NOT NULL,
                accepted_by     TEXT NOT NULL,
                accepted_at     TEXT NOT NULL,
                acceptance_mode TEXT NOT NULL DEFAULT 'explicit_button',
                acceptance_note TEXT,
                FOREIGN KEY (restatement_id) REFERENCES intent_restatements(restatement_id)
            )
        """)
        self._ensure_column("intent_acceptances", "accepted_actions_json", "TEXT")
        self._ensure_column("intent_acceptances", "action_count", "INTEGER")
        self._ensure_column("intent_acceptances", "dependency_graph_json", "TEXT")
        self._ensure_column("intent_acceptances", "clarification_history_json", "TEXT")
        self._ensure_column("intent_acceptances", "user_confirmation", "TEXT")

        # Table 5: behavior_sequences
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS behavior_sequences (
                sequence_id             TEXT PRIMARY KEY,
                swarm_id                TEXT NOT NULL,
                sequence_name           TEXT,
                ordered_steps_json      TEXT NOT NULL,
                target_paths_json       TEXT NOT NULL,
                acceptance_tests_json   TEXT NOT NULL,
                execution_class         TEXT,
                evidence_expectations_json TEXT,
                created_at              TEXT NOT NULL,
                updated_at              TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id)
            )
        """)

        # Table 6: swarm_schedules
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarm_schedules (
                schedule_id     TEXT PRIMARY KEY,
                swarm_id        TEXT NOT NULL,
                trigger_type    TEXT NOT NULL,
                run_at          TEXT,
                cron_expression TEXT,
                timezone        TEXT DEFAULT 'UTC',
                enabled         INTEGER NOT NULL DEFAULT 1,
                next_run_at     TEXT,
                last_evaluated_at TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id)
            )
        """)

        # Table 7: swarm_deliveries
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarm_deliveries (
                delivery_id     TEXT PRIMARY KEY,
                swarm_id        TEXT NOT NULL,
                delivery_type   TEXT NOT NULL,
                destination     TEXT NOT NULL,
                recipient_profile_id TEXT,
                format          TEXT,
                message_template TEXT,
                enabled         INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                FOREIGN KEY (recipient_profile_id) REFERENCES recipient_profiles(profile_id)
            )
        """)

        # Table 8: swarm_runs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarm_runs (
                run_id                  TEXT PRIMARY KEY,
                swarm_id                TEXT NOT NULL,
                trigger_source          TEXT NOT NULL,
                run_status              TEXT NOT NULL DEFAULT 'queued',
                delivery_status         TEXT NOT NULL DEFAULT 'not_applicable',
                runtime_execution_id    TEXT,
                artifact_refs_json      TEXT,
                error_summary           TEXT,
                triggered_at            TEXT NOT NULL,
                started_at              TEXT,
                finished_at             TEXT,
                created_by_trigger      TEXT,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id)
            )
        """)

        # Table 9: delivery_receipts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS delivery_receipts (
                receipt_id              TEXT PRIMARY KEY,
                run_id                  TEXT NOT NULL,
                delivery_id             TEXT NOT NULL,
                delivery_type           TEXT NOT NULL,
                sent_at                 TEXT NOT NULL,
                delivery_status         TEXT NOT NULL,
                provider_message_id     TEXT,
                provider_response_summary TEXT,
                FOREIGN KEY (run_id) REFERENCES swarm_runs(run_id),
                FOREIGN KEY (delivery_id) REFERENCES swarm_deliveries(delivery_id)
            )
        """)

        # Table 10: swarm_events
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarm_events (
                event_id            TEXT PRIMARY KEY,
                swarm_id            TEXT NOT NULL,
                event_type          TEXT NOT NULL,
                event_time          TEXT NOT NULL,
                actor_id            TEXT,
                summary             TEXT,
                details_json        TEXT,
                related_entity_type TEXT,
                related_entity_id   TEXT,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id)
            )
        """)

        # Table 11: tool_registry
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tool_registry (
                tool_id             TEXT PRIMARY KEY,
                tool_name           TEXT NOT NULL UNIQUE,
                description         TEXT NOT NULL,
                tool_family         TEXT,
                schema_ref          TEXT,
                allowed_scope_class TEXT,
                execution_class     TEXT,
                maturity_status     TEXT NOT NULL DEFAULT 'active'
                    CHECK (maturity_status IN (
                        'active', 'experimental', 'disabled', 'planned'
                    )),
                supports_dry_run    INTEGER NOT NULL DEFAULT 0
                    CHECK (supports_dry_run IN (0, 1)),
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL
            )
        """)

        # Table 12: swarm_actions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarm_actions (
                action_id           TEXT PRIMARY KEY,
                swarm_id            TEXT NOT NULL,
                step_order          INTEGER NOT NULL,
                action_name         TEXT NOT NULL,
                action_text         TEXT NOT NULL,
                action_type         TEXT,
                target_path         TEXT,
                output_artifact_type TEXT,
                action_status       TEXT NOT NULL DEFAULT 'draft'
                    CHECK (action_status IN (
                        'draft', 'defined', 'supported',
                        'supported_with_constraints', 'ambiguous',
                        'unsupported', 'requires_new_tool', 'approved'
                    )),
                requires_user_confirmation INTEGER NOT NULL DEFAULT 0
                    CHECK (requires_user_confirmation IN (0, 1)),
                created_at          TEXT NOT NULL,
                updated_at          TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                UNIQUE (swarm_id, step_order)
            )
        """)

        # Table 13: swarm_action_dependencies
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS swarm_action_dependencies (
                dependency_id       TEXT PRIMARY KEY,
                swarm_id            TEXT NOT NULL,
                action_id           TEXT NOT NULL,
                depends_on_action_id TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                FOREIGN KEY (action_id) REFERENCES swarm_actions(action_id),
                FOREIGN KEY (depends_on_action_id) REFERENCES swarm_actions(action_id),
                CHECK (action_id <> depends_on_action_id)
            )
        """)

        # Table 14: action_tool_readiness
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS action_tool_readiness (
                readiness_id        TEXT PRIMARY KEY,
                action_id           TEXT NOT NULL,
                tool_id             TEXT,
                match_status        TEXT NOT NULL
                    CHECK (match_status IN (
                        'supported', 'supported_with_constraints',
                        'ambiguous', 'unsupported', 'requires_new_tool'
                    )),
                confidence_score    REAL,
                requires_new_tool   INTEGER NOT NULL DEFAULT 0
                    CHECK (requires_new_tool IN (0, 1)),
                constraint_notes    TEXT,
                reviewer_notes      TEXT,
                checked_at          TEXT NOT NULL,
                checked_by          TEXT,
                FOREIGN KEY (action_id) REFERENCES swarm_actions(action_id),
                FOREIGN KEY (tool_id) REFERENCES tool_registry(tool_id)
            )
        """)

        # Table 15: tool_scope_rules
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tool_scope_rules (
                rule_id             TEXT PRIMARY KEY,
                tool_id             TEXT NOT NULL,
                scope_pattern       TEXT NOT NULL,
                effect              TEXT NOT NULL
                    CHECK (effect IN ('allow', 'deny')),
                notes               TEXT,
                FOREIGN KEY (tool_id) REFERENCES tool_registry(tool_id)
            )
        """)

        # Table 16: proposed_tools
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS proposed_tools (
                proposed_tool_id    TEXT PRIMARY KEY,
                action_id           TEXT NOT NULL,
                proposed_tool_name  TEXT NOT NULL,
                purpose             TEXT NOT NULL,
                proposed_schema_ref TEXT,
                proposed_scope_class TEXT,
                proposal_status     TEXT NOT NULL DEFAULT 'draft'
                    CHECK (proposal_status IN (
                        'draft', 'review', 'approved',
                        'rejected', 'implemented'
                    )),
                created_at          TEXT NOT NULL,
                created_by          TEXT,
                notes               TEXT,
                FOREIGN KEY (action_id) REFERENCES swarm_actions(action_id)
            )
        """)

        # Table 17: run_action_results
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS run_action_results (
                run_action_result_id TEXT PRIMARY KEY,
                run_id              TEXT NOT NULL,
                action_id           TEXT NOT NULL,
                step_order          INTEGER NOT NULL,
                execution_status    TEXT NOT NULL
                    CHECK (execution_status IN (
                        'pending', 'skipped', 'executing',
                        'completed', 'failed'
                    )),
                tool_id             TEXT,
                artifact_ref        TEXT,
                started_at          TEXT,
                completed_at        TEXT,
                error_summary       TEXT,
                FOREIGN KEY (run_id) REFERENCES swarm_runs(run_id),
                FOREIGN KEY (action_id) REFERENCES swarm_actions(action_id),
                FOREIGN KEY (tool_id) REFERENCES tool_registry(tool_id),
                UNIQUE (run_id, action_id)
            )
        """)

        # Table 18: artifact_refs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS artifact_refs (
                artifact_ref_id     TEXT PRIMARY KEY,
                owner_type          TEXT NOT NULL
                    CHECK (owner_type IN (
                        'swarm_version', 'swarm_run',
                        'run_action_result', 'review'
                    )),
                owner_id            TEXT NOT NULL,
                artifact_kind       TEXT NOT NULL,
                artifact_path       TEXT NOT NULL,
                digest              TEXT,
                signer_role         TEXT,
                created_at          TEXT NOT NULL
            )
        """)

        # Table 19: intent_archetypes
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS intent_archetypes (
                archetype_id        TEXT PRIMARY KEY,
                intent_id           TEXT NOT NULL,
                swarm_archetype     TEXT NOT NULL
                    CHECK (swarm_archetype IN (
                        'structured_report', 'scheduled_structured_report',
                        'document_generation', 'single_file_web_app',
                        'multi_file_web_app', 'code_generation',
                        'data_transformation', 'configuration',
                        'software_build', 'communication_artifact',
                        'monitoring_workflow', 'delivery_workflow'
                    )),
                complexity_class    TEXT NOT NULL DEFAULT 'moderate'
                    CHECK (complexity_class IN ('simple', 'moderate', 'complex')),
                decomposition_required INTEGER NOT NULL DEFAULT 1
                    CHECK (decomposition_required IN (0, 1)),
                confidence          REAL NOT NULL DEFAULT 0.0,
                reasoning           TEXT,
                source              TEXT NOT NULL DEFAULT 'rules'
                    CHECK (source IN ('acds', 'ollama', 'rules', 'user_override')),
                created_at          TEXT NOT NULL,
                FOREIGN KEY (intent_id) REFERENCES intent_drafts(draft_id)
            )
        """)

        # Table 20: constraint_sets
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS constraint_sets (
                constraint_set_id   TEXT PRIMARY KEY,
                intent_id           TEXT NOT NULL,
                constraints_json    TEXT NOT NULL,
                extraction_notes    TEXT,
                created_at          TEXT NOT NULL,
                FOREIGN KEY (intent_id) REFERENCES intent_drafts(draft_id)
            )
        """)
        self._ensure_column("constraint_sets", "action_table_ref", "TEXT")
        self._ensure_column("constraint_sets", "archetype_ref", "TEXT")
        self._ensure_column("constraint_sets", "artifact_type", "TEXT")
        self._ensure_column("constraint_sets", "missing_required_json", "TEXT")
        self._ensure_column("constraint_sets", "ambiguous_fields_json", "TEXT")
        self._ensure_column("constraint_sets", "clarification_questions_json", "TEXT")
        self._ensure_column("constraint_sets", "extraction_method", "TEXT")
        self._ensure_column("constraint_sets", "resolution_state", "TEXT")

        # Table 21: action_table_acceptances
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS action_table_acceptances (
                acceptance_id       TEXT PRIMARY KEY,
                swarm_id            TEXT NOT NULL,
                accepted_by         TEXT NOT NULL,
                accepted_at         TEXT NOT NULL,
                acceptance_mode     TEXT NOT NULL DEFAULT 'explicit_button',
                action_count        INTEGER NOT NULL,
                tool_readiness_summary TEXT,
                notes               TEXT,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id)
            )
        """)
        self._ensure_column("action_table_acceptances", "action_table_ref", "TEXT")
        self._ensure_column("action_table_acceptances", "tool_match_set_ref", "TEXT")

        # Table 22: governance_warning_records
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS governance_warning_records (
                warning_id           TEXT PRIMARY KEY,
                swarm_id             TEXT,
                run_id               TEXT,
                warning_family       TEXT NOT NULL,
                severity             TEXT NOT NULL,
                trigger_stage        TEXT NOT NULL,
                message              TEXT NOT NULL,
                details              TEXT,
                boundary_at_risk     TEXT NOT NULL,
                assurance_posture_before TEXT,
                assurance_posture_after TEXT,
                impact_summary       TEXT,
                safer_alternative    TEXT,
                proceeding_means     TEXT,
                affected_artifact_refs_json TEXT NOT NULL,
                affected_swarm_ref   TEXT,
                affected_run_ref     TEXT,
                policy_refs_json     TEXT,
                evidence_refs_json   TEXT,
                operator_decision    TEXT NOT NULL,
                override_required    INTEGER NOT NULL DEFAULT 0
                    CHECK (override_required IN (0, 1)),
                override_reason_category TEXT,
                override_reason      TEXT,
                decision_fingerprint TEXT NOT NULL,
                actor_id             TEXT NOT NULL,
                actor_role           TEXT,
                created_at           TEXT NOT NULL,
                acknowledged_at      TEXT,
                notes                TEXT,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                FOREIGN KEY (run_id) REFERENCES swarm_runs(run_id)
            )
        """)

        # Table 23: reduced_assurance_governance_events
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS reduced_assurance_governance_events (
                event_id             TEXT PRIMARY KEY,
                swarm_id             TEXT,
                run_id               TEXT,
                governance_action_type TEXT NOT NULL,
                reduction_type       TEXT NOT NULL,
                assurance_posture_before TEXT NOT NULL,
                assurance_posture_after TEXT NOT NULL,
                reason_summary       TEXT NOT NULL,
                reason_details       TEXT,
                normal_expected_governance TEXT,
                actual_governance_path TEXT,
                compensating_controls_json TEXT,
                affected_artifact_refs_json TEXT NOT NULL,
                affected_run_ref     TEXT,
                policy_refs_json     TEXT,
                warning_record_ref   TEXT,
                actor_id             TEXT NOT NULL,
                actor_role           TEXT,
                acknowledged_by      TEXT,
                acknowledged_at      TEXT,
                created_at           TEXT NOT NULL,
                expires_at           TEXT,
                notes                TEXT,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                FOREIGN KEY (run_id) REFERENCES swarm_runs(run_id),
                FOREIGN KEY (warning_record_ref)
                    REFERENCES governance_warning_records(warning_id)
            )
        """)

        # Table 24: intent_clarifications
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS intent_clarifications (
                clarification_id    TEXT PRIMARY KEY,
                swarm_id            TEXT NOT NULL,
                draft_id            TEXT NOT NULL,
                restatement_id      TEXT,
                action_index        INTEGER,
                issue_type          TEXT NOT NULL,
                question_text       TEXT NOT NULL,
                response_text       TEXT,
                resolution_status   TEXT NOT NULL DEFAULT 'open',
                created_by          TEXT NOT NULL,
                created_at          TEXT NOT NULL,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                FOREIGN KEY (draft_id) REFERENCES intent_drafts(draft_id),
                FOREIGN KEY (restatement_id) REFERENCES intent_restatements(restatement_id)
            )
        """)

        # Table 25: action_tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS action_tables (
                action_table_id      TEXT PRIMARY KEY,
                swarm_id             TEXT NOT NULL,
                intent_ref           TEXT NOT NULL,
                artifact_type        TEXT NOT NULL DEFAULT 'action_table',
                status               TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'validated', 'accepted', 'compiled')),
                actions_json         TEXT NOT NULL,
                validation_notes_json TEXT,
                created_at           TEXT NOT NULL,
                compiled_at          TEXT,
                FOREIGN KEY (swarm_id) REFERENCES swarms(swarm_id),
                FOREIGN KEY (intent_ref) REFERENCES intent_acceptances(acceptance_id)
            )
        """)

        # Table 26: archetype_classifications
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS archetype_classifications (
                archetype_classification_id TEXT PRIMARY KEY,
                action_table_ref     TEXT NOT NULL,
                artifact_type        TEXT NOT NULL DEFAULT 'archetype_classification',
                archetype_id         TEXT,
                confidence           REAL NOT NULL DEFAULT 0.0,
                classification_state TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (classification_state IN (
                        'unknown', 'candidate', 'classified', 'custom'
                    )),
                matched_capabilities_json TEXT,
                dependency_structure TEXT,
                classification_notes_json TEXT,
                created_at           TEXT NOT NULL,
                FOREIGN KEY (action_table_ref) REFERENCES action_tables(action_table_id)
            )
        """)

        # Table 27: tool_match_sets
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tool_match_sets (
                tool_match_set_id    TEXT PRIMARY KEY,
                action_table_ref     TEXT NOT NULL,
                tool_inventory_version TEXT,
                policy_snapshot_ref  TEXT,
                matches_json         TEXT NOT NULL,
                created_at           TEXT NOT NULL,
                FOREIGN KEY (action_table_ref) REFERENCES action_tables(action_table_id)
            )
        """)

        # Table 28: capability_families
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS capability_families (
                family_id            TEXT PRIMARY KEY,
                description          TEXT NOT NULL,
                supported_verbs_json TEXT NOT NULL,
                default_object_types_json TEXT,
                security_classification TEXT,
                created_at           TEXT NOT NULL,
                updated_at           TEXT NOT NULL
            )
        """)

        # Table 29: tool_capability_family_bindings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tool_capability_family_bindings (
                binding_id           TEXT PRIMARY KEY,
                tool_id              TEXT NOT NULL,
                family_id            TEXT NOT NULL,
                created_at           TEXT NOT NULL,
                FOREIGN KEY (tool_id) REFERENCES tool_registry(tool_id),
                FOREIGN KEY (family_id) REFERENCES capability_families(family_id),
                UNIQUE (tool_id, family_id)
            )
        """)

        # Table 30: recipient_profiles
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recipient_profiles (
                profile_id       TEXT PRIMARY KEY,
                profile_name     TEXT NOT NULL UNIQUE,
                description      TEXT,
                enabled          INTEGER NOT NULL DEFAULT 1,
                to_addresses     TEXT NOT NULL,
                cc_addresses     TEXT,
                bcc_addresses    TEXT,
                owner            TEXT NOT NULL,
                lineage_ref      TEXT NOT NULL,
                allowed_sender_identities TEXT,
                allowed_delivery_profiles TEXT,
                allowed_workflows TEXT,
                max_recipients   INTEGER,
                tags_json        TEXT,
                metadata_json    TEXT,
                created_at       TEXT NOT NULL,
                updated_at       TEXT NOT NULL
            )
        """)

        # Indexes
        _indexes = [
            "CREATE INDEX IF NOT EXISTS idx_swarms_status ON swarms(lifecycle_status)",
            "CREATE INDEX IF NOT EXISTS idx_swarms_name ON swarms(swarm_name)",
            "CREATE INDEX IF NOT EXISTS idx_drafts_swarm ON intent_drafts(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_drafts_session ON intent_drafts(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_restatements_draft ON intent_restatements(draft_id)",
            "CREATE INDEX IF NOT EXISTS idx_acceptances_restatement ON intent_acceptances(restatement_id)",
            "CREATE INDEX IF NOT EXISTS idx_sequences_swarm ON behavior_sequences(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_schedules_swarm ON swarm_schedules(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON swarm_schedules(next_run_at)",
            "CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON swarm_schedules(enabled)",
            "CREATE INDEX IF NOT EXISTS idx_deliveries_swarm ON swarm_deliveries(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_runs_swarm ON swarm_runs(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_runs_status ON swarm_runs(run_status)",
            "CREATE INDEX IF NOT EXISTS idx_runs_triggered ON swarm_runs(triggered_at)",
            "CREATE INDEX IF NOT EXISTS idx_receipts_run ON delivery_receipts(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_events_swarm ON swarm_events(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_events_type ON swarm_events(event_type)",
            "CREATE INDEX IF NOT EXISTS idx_events_time ON swarm_events(event_time)",
            "CREATE INDEX IF NOT EXISTS idx_tool_registry_name ON tool_registry(tool_name)",
            "CREATE INDEX IF NOT EXISTS idx_tools_maturity ON tool_registry(maturity_status)",
            "CREATE INDEX IF NOT EXISTS idx_actions_swarm_order ON swarm_actions(swarm_id, step_order)",
            "CREATE INDEX IF NOT EXISTS idx_actions_status ON swarm_actions(action_status)",
            "CREATE INDEX IF NOT EXISTS idx_readiness_action ON action_tool_readiness(action_id)",
            "CREATE INDEX IF NOT EXISTS idx_readiness_status ON action_tool_readiness(match_status)",
            "CREATE INDEX IF NOT EXISTS idx_run_results_run ON run_action_results(run_id, step_order)",
            "CREATE INDEX IF NOT EXISTS idx_archetypes_intent ON intent_archetypes(intent_id)",
            "CREATE INDEX IF NOT EXISTS idx_constraint_sets_intent ON constraint_sets(intent_id)",
            "CREATE INDEX IF NOT EXISTS idx_constraint_sets_action_table ON constraint_sets(action_table_ref)",
            "CREATE INDEX IF NOT EXISTS idx_action_table_acceptances_swarm ON action_table_acceptances(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_warning_records_swarm ON governance_warning_records(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_warning_records_run ON governance_warning_records(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_warning_records_family ON governance_warning_records(warning_family)",
            "CREATE INDEX IF NOT EXISTS idx_warning_records_fingerprint ON governance_warning_records(decision_fingerprint)",
            "CREATE INDEX IF NOT EXISTS idx_reduced_assurance_swarm ON reduced_assurance_governance_events(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_reduced_assurance_run ON reduced_assurance_governance_events(run_id)",
            "CREATE INDEX IF NOT EXISTS idx_intent_clarifications_swarm ON intent_clarifications(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_intent_clarifications_draft ON intent_clarifications(draft_id)",
            "CREATE INDEX IF NOT EXISTS idx_action_tables_swarm ON action_tables(swarm_id)",
            "CREATE INDEX IF NOT EXISTS idx_action_tables_status ON action_tables(status)",
            "CREATE INDEX IF NOT EXISTS idx_archetype_classifications_action_table ON archetype_classifications(action_table_ref)",
            "CREATE INDEX IF NOT EXISTS idx_tool_match_sets_action_table ON tool_match_sets(action_table_ref)",
            "CREATE INDEX IF NOT EXISTS idx_tool_family_bindings_tool ON tool_capability_family_bindings(tool_id)",
            "CREATE INDEX IF NOT EXISTS idx_tool_family_bindings_family ON tool_capability_family_bindings(family_id)",
            "CREATE INDEX IF NOT EXISTS idx_recipient_profiles_name ON recipient_profiles(profile_name)",
            "CREATE INDEX IF NOT EXISTS idx_recipient_profiles_enabled ON recipient_profiles(enabled)",
            "CREATE INDEX IF NOT EXISTS idx_deliveries_profile ON swarm_deliveries(recipient_profile_id)",
        ]
        for idx_sql in _indexes:
            cursor.execute(idx_sql)

        self.conn.commit()

    def _column_exists(self, table_name: str, column_name: str) -> bool:
        if not self.conn:
            raise RuntimeError("Database not connected. Call connect() first.")
        rows = self.conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(row["name"] == column_name for row in rows)

    def _ensure_column(
        self,
        table_name: str,
        column_name: str,
        column_type_sql: str,
    ) -> None:
        if self._column_exists(table_name, column_name):
            return
        self.conn.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type_sql}"
        )

    def verify_integrity(self) -> list[str]:
        if not self.conn:
            raise RuntimeError("Database not connected. Call connect() first.")
        try:
            rows = self.conn.execute("PRAGMA integrity_check").fetchall()
        except Exception as exc:
            return [f"integrity_check failed: {exc}"]
        errors = []
        for row in rows:
            value = row[0] if isinstance(row, (tuple, list)) else row["integrity_check"]
            if value != "ok":
                errors.append(str(value))
        return errors

    def verify_referential_consistency(self) -> list[str]:
        if not self.conn:
            raise RuntimeError("Database not connected. Call connect() first.")

        violations = []
        _checks = [
            (
                "swarm_runs → swarms",
                """
                SELECT r.run_id, r.swarm_id
                FROM swarm_runs r
                LEFT JOIN swarms s ON r.swarm_id = s.swarm_id
                WHERE s.swarm_id IS NULL
                """,
            ),
            (
                "swarm_actions → swarms",
                """
                SELECT a.action_id, a.swarm_id
                FROM swarm_actions a
                LEFT JOIN swarms s ON a.swarm_id = s.swarm_id
                WHERE s.swarm_id IS NULL
                """,
            ),
            (
                "intent_acceptances → intent_restatements",
                """
                SELECT ia.acceptance_id, ia.restatement_id
                FROM intent_acceptances ia
                LEFT JOIN intent_restatements ir
                    ON ia.restatement_id = ir.restatement_id
                WHERE ir.restatement_id IS NULL
                """,
            ),
            (
                "behavior_sequences → swarms",
                """
                SELECT bs.sequence_id, bs.swarm_id
                FROM behavior_sequences bs
                LEFT JOIN swarms s ON bs.swarm_id = s.swarm_id
                WHERE s.swarm_id IS NULL
                """,
            ),
            (
                "action_tool_readiness → swarm_actions",
                """
                SELECT atr.readiness_id, atr.action_id
                FROM action_tool_readiness atr
                LEFT JOIN swarm_actions sa
                    ON atr.action_id = sa.action_id
                WHERE sa.action_id IS NULL
                """,
            ),
        ]

        for label, query in _checks:
            rows = self.conn.execute(query).fetchall()
            for row in rows:
                violations.append(f"Orphaned {label}: {dict(row)}")

        return violations
