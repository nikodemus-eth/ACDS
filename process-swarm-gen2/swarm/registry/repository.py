"""Swarm Registry repository — CRUD operations for all platform entities."""

from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from swarm.registry.database import RegistryDatabase


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


class SwarmRepository:
    """Repository layer for all Swarm Registry entities."""

    def __init__(self, db: RegistryDatabase):
        self.db = db
        self._auto_commit = True

    @property
    def conn(self):
        if not self.db.conn:
            raise RuntimeError("Database not connected")
        return self.db.conn

    def _commit(self) -> None:
        if self._auto_commit:
            self.conn.commit()

    @contextmanager
    def atomic(self):
        with self.db.transaction():
            self._auto_commit = False
            try:
                yield
            finally:
                self._auto_commit = True

    # ──────────────────────────────────────────────
    # Swarm CRUD
    # ──────────────────────────────────────────────

    def create_swarm(
        self, swarm_name: str, description: str, created_by: str,
    ) -> str:
        swarm_id = _new_id("swarm")
        now = _now()
        self.conn.execute(
            """INSERT INTO swarms
                (swarm_id, swarm_name, description, lifecycle_status,
                 created_by, created_at, updated_at)
            VALUES (?, ?, ?, 'drafting', ?, ?, ?)""",
            (swarm_id, swarm_name, description, created_by, now, now),
        )
        self._commit()
        return swarm_id

    def get_swarm(self, swarm_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM swarms WHERE swarm_id = ?", (swarm_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_swarms(self, status: Optional[str] = None) -> list[dict]:
        if status:
            rows = self.conn.execute(
                "SELECT * FROM swarms WHERE lifecycle_status = ? ORDER BY created_at DESC",
                (status,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM swarms ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def update_swarm(self, swarm_id: str, **fields: Any) -> None:
        if not fields:
            return
        fields["updated_at"] = _now()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [swarm_id]
        self.conn.execute(
            f"UPDATE swarms SET {set_clause} WHERE swarm_id = ?", values,
        )
        self._commit()

    # ──────────────────────────────────────────────
    # Intent lifecycle
    # ──────────────────────────────────────────────

    def create_intent_draft(
        self,
        swarm_id: str,
        raw_text: str,
        created_by: str,
        revision_index: int = 0,
        parent_draft_id: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> str:
        draft_id = _new_id("draft")
        now = _now()
        self.conn.execute(
            """INSERT INTO intent_drafts
                (draft_id, swarm_id, raw_intent_text, revision_index,
                 parent_draft_id, session_id, status, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
            (draft_id, swarm_id, raw_text, revision_index,
             parent_draft_id, session_id, created_by, now),
        )
        self._commit()
        return draft_id

    def get_intent_draft(self, draft_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM intent_drafts WHERE draft_id = ?", (draft_id,)
        ).fetchone()
        return dict(row) if row else None

    get_draft = get_intent_draft

    def get_latest_draft(self, swarm_id: str) -> dict | None:
        row = self.conn.execute(
            """SELECT * FROM intent_drafts WHERE swarm_id = ?
               ORDER BY created_at DESC LIMIT 1""",
            (swarm_id,),
        ).fetchone()
        return dict(row) if row else None

    def create_restatement(
        self,
        draft_id: str,
        summary: str,
        structured_steps: list[dict],
        expected_outputs: Optional[list[str]] = None,
        inferred_constraints: Optional[dict] = None,
        extracted_actions: Optional[list[dict]] = None,
        dependency_graph: Optional[dict] = None,
        unresolved_issues: Optional[list[dict]] = None,
        clarification_history: Optional[list[dict]] = None,
    ) -> str:
        restatement_id = _new_id("restatement")
        now = _now()
        self.conn.execute(
            """INSERT INTO intent_restatements
                (restatement_id, draft_id, human_readable_summary,
                 structured_steps_json, expected_outputs_json,
                 inferred_constraints_json, extracted_actions_json,
                 dependency_graph_json, unresolved_issues_json,
                 clarification_history_json, status, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)""",
            (
                restatement_id, draft_id, summary,
                json.dumps(structured_steps),
                json.dumps(expected_outputs) if expected_outputs else None,
                json.dumps(inferred_constraints) if inferred_constraints else None,
                json.dumps(extracted_actions) if extracted_actions is not None else None,
                json.dumps(dependency_graph) if dependency_graph is not None else None,
                json.dumps(unresolved_issues) if unresolved_issues is not None else None,
                json.dumps(clarification_history) if clarification_history is not None else None,
                now,
            ),
        )
        self._commit()
        return restatement_id

    def get_restatement(self, restatement_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM intent_restatements WHERE restatement_id = ?",
            (restatement_id,),
        ).fetchone()
        return dict(row) if row else None

    def accept_intent(
        self,
        restatement_id: str,
        accepted_by: str,
        mode: str = "explicit_button",
        note: Optional[str] = None,
        accepted_actions: Optional[list[dict]] = None,
        dependency_graph: Optional[dict] = None,
        clarification_history: Optional[list[dict]] = None,
        user_confirmation: Optional[str] = None,
    ) -> str:
        acceptance_id = _new_id("accept")
        now = _now()
        self.conn.execute(
            """INSERT INTO intent_acceptances
                (acceptance_id, restatement_id, accepted_by,
                 accepted_at, acceptance_mode, acceptance_note,
                 accepted_actions_json, action_count,
                 dependency_graph_json, clarification_history_json,
                 user_confirmation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                acceptance_id, restatement_id, accepted_by, now, mode, note,
                json.dumps(accepted_actions) if accepted_actions is not None else None,
                len(accepted_actions) if accepted_actions is not None else None,
                json.dumps(dependency_graph) if dependency_graph is not None else None,
                json.dumps(clarification_history) if clarification_history is not None else None,
                user_confirmation,
            ),
        )
        self.conn.execute(
            "UPDATE intent_restatements SET status = 'accepted' WHERE restatement_id = ?",
            (restatement_id,),
        )
        restatement = self.get_restatement(restatement_id)
        if restatement:
            self.conn.execute(
                "UPDATE intent_drafts SET status = 'accepted_source' WHERE draft_id = ?",
                (restatement["draft_id"],),
            )
        self._commit()
        return acceptance_id

    def get_acceptance(self, acceptance_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM intent_acceptances WHERE acceptance_id = ?",
            (acceptance_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Clarifications
    # ──────────────────────────────────────────────

    def create_intent_clarification(
        self,
        swarm_id: str,
        draft_id: str,
        issue_type: str,
        question_text: str,
        created_by: str,
        response_text: Optional[str] = None,
        resolution_status: str = "open",
        restatement_id: Optional[str] = None,
        action_index: Optional[int] = None,
    ) -> str:
        clarification_id = _new_id("clar")
        now = _now()
        self.conn.execute(
            """INSERT INTO intent_clarifications
                (clarification_id, swarm_id, draft_id, restatement_id,
                 action_index, issue_type, question_text, response_text,
                 resolution_status, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (clarification_id, swarm_id, draft_id, restatement_id,
             action_index, issue_type, question_text, response_text,
             resolution_status, created_by, now),
        )
        self._commit()
        return clarification_id

    def list_intent_clarifications(
        self,
        swarm_id: Optional[str] = None,
        draft_id: Optional[str] = None,
        restatement_id: Optional[str] = None,
        limit: int = 200,
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if swarm_id:
            clauses.append("swarm_id = ?")
            params.append(swarm_id)
        if draft_id:
            clauses.append("draft_id = ?")
            params.append(draft_id)
        if restatement_id:
            clauses.append("restatement_id = ?")
            params.append(restatement_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.conn.execute(
            f"SELECT * FROM intent_clarifications {where} "
            "ORDER BY created_at DESC LIMIT ?",
            (*params, limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def get_intent_clarification(self, clarification_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM intent_clarifications WHERE clarification_id = ?",
            (clarification_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Action Tables
    # ──────────────────────────────────────────────

    def create_action_table(
        self,
        swarm_id: str,
        intent_ref: str,
        actions: list[dict],
        status: str = "accepted",
        validation_notes: Optional[list[dict]] = None,
    ) -> str:
        action_table_id = _new_id("atable")
        now = _now()
        self.conn.execute(
            """INSERT INTO action_tables
                (action_table_id, swarm_id, intent_ref, artifact_type,
                 status, actions_json, validation_notes_json, created_at)
            VALUES (?, ?, ?, 'action_table', ?, ?, ?, ?)""",
            (action_table_id, swarm_id, intent_ref, status,
             json.dumps(actions),
             json.dumps(validation_notes) if validation_notes is not None else None,
             now),
        )
        self._commit()
        return action_table_id

    def get_action_table(self, action_table_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM action_tables WHERE action_table_id = ?",
            (action_table_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_latest_action_table_for_swarm(self, swarm_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM action_tables WHERE swarm_id = ? ORDER BY created_at DESC LIMIT 1",
            (swarm_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Archetype Classifications
    # ──────────────────────────────────────────────

    def create_archetype_classification(
        self,
        action_table_ref: str,
        archetype_id: Optional[str],
        confidence: float,
        classification_state: str,
        matched_capabilities: Optional[list[str]] = None,
        dependency_structure: Optional[str] = None,
        classification_notes: Optional[dict] = None,
    ) -> str:
        classification_id = _new_id("aclass")
        now = _now()
        self.conn.execute(
            """INSERT INTO archetype_classifications
                (archetype_classification_id, action_table_ref, artifact_type,
                 archetype_id, confidence, classification_state,
                 matched_capabilities_json, dependency_structure,
                 classification_notes_json, created_at)
            VALUES (?, ?, 'archetype_classification', ?, ?, ?, ?, ?, ?, ?)""",
            (classification_id, action_table_ref, archetype_id, confidence,
             classification_state,
             json.dumps(matched_capabilities) if matched_capabilities is not None else None,
             dependency_structure,
             json.dumps(classification_notes) if classification_notes is not None else None,
             now),
        )
        self._commit()
        return classification_id

    def get_archetype_classification(self, classification_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM archetype_classifications WHERE archetype_classification_id = ?",
            (classification_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_latest_archetype_classification_for_action_table(
        self, action_table_ref: str
    ) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM archetype_classifications WHERE action_table_ref = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (action_table_ref,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Tool Match Sets
    # ──────────────────────────────────────────────

    def create_tool_match_set(
        self,
        action_table_ref: str,
        matches: list[dict],
        tool_inventory_version: Optional[str] = None,
        policy_snapshot_ref: Optional[str] = None,
    ) -> str:
        tool_match_set_id = _new_id("tmatch")
        now = _now()
        self.conn.execute(
            """INSERT INTO tool_match_sets
                (tool_match_set_id, action_table_ref, tool_inventory_version,
                 policy_snapshot_ref, matches_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (tool_match_set_id, action_table_ref, tool_inventory_version,
             policy_snapshot_ref, json.dumps(matches), now),
        )
        self._commit()
        return tool_match_set_id

    def get_tool_match_set(self, tool_match_set_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM tool_match_sets WHERE tool_match_set_id = ?",
            (tool_match_set_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_latest_tool_match_set_for_action_table(
        self, action_table_ref: str
    ) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM tool_match_sets WHERE action_table_ref = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (action_table_ref,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Capability Families
    # ──────────────────────────────────────────────

    def create_capability_family(
        self,
        family_id: str,
        description: str,
        supported_verbs: list[str],
        default_object_types: Optional[list[str]] = None,
        security_classification: Optional[str] = None,
    ) -> str:
        now = _now()
        self.conn.execute(
            """INSERT OR REPLACE INTO capability_families
                (family_id, description, supported_verbs_json,
                 default_object_types_json, security_classification,
                 created_at, updated_at)
            VALUES (
                ?, ?, ?, ?, ?,
                COALESCE((SELECT created_at FROM capability_families WHERE family_id = ?), ?),
                ?
            )""",
            (family_id, description, json.dumps(supported_verbs),
             json.dumps(default_object_types) if default_object_types is not None else None,
             security_classification, family_id, now, now),
        )
        self._commit()
        return family_id

    def list_capability_families(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM capability_families ORDER BY family_id ASC"
        ).fetchall()
        return [dict(row) for row in rows]

    def bind_tool_to_capability_family(self, tool_id: str, family_id: str) -> str:
        binding_id = _new_id("cfbind")
        now = _now()
        self.conn.execute(
            """INSERT OR IGNORE INTO tool_capability_family_bindings
                (binding_id, tool_id, family_id, created_at)
            VALUES (?, ?, ?, ?)""",
            (binding_id, tool_id, family_id, now),
        )
        self._commit()
        row = self.conn.execute(
            "SELECT binding_id FROM tool_capability_family_bindings "
            "WHERE tool_id = ? AND family_id = ?",
            (tool_id, family_id),
        ).fetchone()
        return row["binding_id"]

    def list_tool_capability_family_bindings(
        self,
        tool_id: Optional[str] = None,
        family_id: Optional[str] = None,
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if tool_id:
            clauses.append("tool_id = ?")
            params.append(tool_id)
        if family_id:
            clauses.append("family_id = ?")
            params.append(family_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.conn.execute(
            f"SELECT * FROM tool_capability_family_bindings {where} "
            "ORDER BY created_at DESC",
            params,
        ).fetchall()
        return [dict(row) for row in rows]

    # ──────────────────────────────────────────────
    # Behavior sequences
    # ──────────────────────────────────────────────

    def create_behavior_sequence(
        self,
        swarm_id: str,
        name: str,
        ordered_steps: list[dict],
        target_paths: list[str],
        acceptance_tests: list[dict],
        execution_class: Optional[str] = None,
        evidence_expectations: Optional[list[str]] = None,
    ) -> str:
        sequence_id = _new_id("seq")
        now = _now()
        self.conn.execute(
            """INSERT INTO behavior_sequences
                (sequence_id, swarm_id, sequence_name, ordered_steps_json,
                 target_paths_json, acceptance_tests_json, execution_class,
                 evidence_expectations_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (sequence_id, swarm_id, name, json.dumps(ordered_steps),
             json.dumps(target_paths), json.dumps(acceptance_tests),
             execution_class,
             json.dumps(evidence_expectations) if evidence_expectations else None,
             now, now),
        )
        self._commit()
        return sequence_id

    def get_behavior_sequence(self, sequence_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM behavior_sequences WHERE sequence_id = ?",
            (sequence_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_behavior_sequence_by_swarm(self, swarm_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM behavior_sequences WHERE swarm_id = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (swarm_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Schedule
    # ──────────────────────────────────────────────

    def create_schedule(
        self,
        swarm_id: str,
        trigger_type: str,
        run_at: Optional[str] = None,
        cron_expression: Optional[str] = None,
        timezone: str = "UTC",
        next_run_at: Optional[str] = None,
    ) -> str:
        schedule_id = _new_id("sched")
        now = _now()
        self.conn.execute(
            """INSERT INTO swarm_schedules
                (schedule_id, swarm_id, trigger_type, run_at,
                 cron_expression, timezone, enabled, next_run_at,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)""",
            (schedule_id, swarm_id, trigger_type, run_at,
             cron_expression, timezone, next_run_at or run_at, now, now),
        )
        self._commit()
        return schedule_id

    def get_schedule(self, schedule_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM swarm_schedules WHERE schedule_id = ?",
            (schedule_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_due_schedules(self, current_time: str) -> list[dict]:
        rows = self.conn.execute(
            """SELECT s.*, sw.lifecycle_status
            FROM swarm_schedules s
            JOIN swarms sw ON s.swarm_id = sw.swarm_id
            WHERE s.enabled = 1
              AND s.next_run_at IS NOT NULL
              AND s.next_run_at <= ?
              AND sw.lifecycle_status = 'enabled'
            ORDER BY s.next_run_at ASC""",
            (current_time,),
        ).fetchall()
        return [dict(r) for r in rows]

    def update_schedule_next_run(
        self, schedule_id: str, next_run_at: Optional[str]
    ) -> None:
        now = _now()
        self.conn.execute(
            """UPDATE swarm_schedules
            SET next_run_at = ?, last_evaluated_at = ?, updated_at = ?
            WHERE schedule_id = ?""",
            (next_run_at, now, now, schedule_id),
        )
        self._commit()

    def disable_schedule(self, schedule_id: str) -> None:
        now = _now()
        self.conn.execute(
            "UPDATE swarm_schedules SET enabled = 0, updated_at = ? WHERE schedule_id = ?",
            (now, schedule_id),
        )
        self._commit()

    def list_schedules(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM swarm_schedules ORDER BY created_at DESC",
        ).fetchall()
        return [dict(r) for r in rows]

    # ──────────────────────────────────────────────
    # Delivery
    # ──────────────────────────────────────────────

    def create_delivery(
        self,
        swarm_id: str,
        delivery_type: str,
        destination: str,
        format: Optional[str] = None,
        message_template: Optional[str] = None,
    ) -> str:
        delivery_id = _new_id("dlvr")
        now = _now()
        self.conn.execute(
            """INSERT INTO swarm_deliveries
                (delivery_id, swarm_id, delivery_type, destination,
                 format, message_template, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)""",
            (delivery_id, swarm_id, delivery_type, destination,
             format, message_template, now, now),
        )
        self._commit()
        return delivery_id

    def get_delivery(self, delivery_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM swarm_deliveries WHERE delivery_id = ?",
            (delivery_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_delivery_by_swarm(self, swarm_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM swarm_deliveries WHERE swarm_id = ? AND enabled = 1 LIMIT 1",
            (swarm_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Recipient Profiles
    # ──────────────────────────────────────────────

    def create_recipient_profile(
        self,
        profile_name: str,
        to_addresses: list[str],
        owner: str,
        lineage_ref: str,
        *,
        description: Optional[str] = None,
        cc_addresses: Optional[list[str]] = None,
        bcc_addresses: Optional[list[str]] = None,
        allowed_sender_identities: Optional[list[str]] = None,
        allowed_delivery_profiles: Optional[list[str]] = None,
        allowed_workflows: Optional[list[str]] = None,
        max_recipients: Optional[int] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        profile_id = _new_id("rprof")
        now = _now()
        self.conn.execute(
            """INSERT INTO recipient_profiles
                (profile_id, profile_name, description, enabled,
                 to_addresses, cc_addresses, bcc_addresses,
                 owner, lineage_ref,
                 allowed_sender_identities, allowed_delivery_profiles,
                 allowed_workflows, max_recipients,
                 tags_json, metadata_json,
                 created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                profile_id, profile_name, description,
                json.dumps(to_addresses),
                json.dumps(cc_addresses) if cc_addresses else None,
                json.dumps(bcc_addresses) if bcc_addresses else None,
                owner, lineage_ref,
                json.dumps(allowed_sender_identities) if allowed_sender_identities else None,
                json.dumps(allowed_delivery_profiles) if allowed_delivery_profiles else None,
                json.dumps(allowed_workflows) if allowed_workflows else None,
                max_recipients,
                json.dumps(tags) if tags else None,
                json.dumps(metadata) if metadata else None,
                now, now,
            ),
        )
        self._commit()
        return profile_id

    def get_recipient_profile(self, profile_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM recipient_profiles WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()
        return self._deserialize_profile(row) if row else None

    def get_recipient_profile_by_name(self, profile_name: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM recipient_profiles WHERE profile_name = ?",
            (profile_name,),
        ).fetchone()
        return self._deserialize_profile(row) if row else None

    def list_recipient_profiles(self, enabled_only: bool = False) -> list[dict]:
        if enabled_only:
            rows = self.conn.execute(
                "SELECT * FROM recipient_profiles WHERE enabled = 1 ORDER BY profile_name"
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM recipient_profiles ORDER BY profile_name"
            ).fetchall()
        return [self._deserialize_profile(r) for r in rows]

    def update_recipient_profile(self, profile_id: str, **kwargs) -> bool:
        row = self.conn.execute(
            "SELECT * FROM recipient_profiles WHERE profile_id = ?",
            (profile_id,),
        ).fetchone()
        if not row:
            return False
        json_fields = {
            "to_addresses", "cc_addresses", "bcc_addresses",
            "allowed_sender_identities", "allowed_delivery_profiles",
            "allowed_workflows", "tags", "metadata",
        }
        sets = []
        vals = []
        for key, val in kwargs.items():
            col = key
            if key == "tags":
                col = "tags_json"
                val = json.dumps(val) if val is not None else None
            elif key == "metadata":
                col = "metadata_json"
                val = json.dumps(val) if val is not None else None
            elif key in json_fields and isinstance(val, list):
                val = json.dumps(val)
            sets.append(f"{col} = ?")
            vals.append(val)
        sets.append("updated_at = ?")
        vals.append(_now())
        vals.append(profile_id)
        self.conn.execute(
            f"UPDATE recipient_profiles SET {', '.join(sets)} WHERE profile_id = ?",
            vals,
        )
        self._commit()
        return True

    def delete_recipient_profile(self, profile_id: str) -> bool:
        return self.update_recipient_profile(profile_id, enabled=0)

    def _deserialize_profile(self, row) -> dict:
        d = dict(row)
        for field in ("to_addresses", "cc_addresses", "bcc_addresses",
                      "allowed_sender_identities", "allowed_delivery_profiles",
                      "allowed_workflows"):
            if d.get(field) and isinstance(d[field], str):
                d[field] = json.loads(d[field])
        if d.get("tags_json") and isinstance(d["tags_json"], str):
            d["tags"] = json.loads(d["tags_json"])
        else:
            d["tags"] = []
        if d.get("metadata_json") and isinstance(d["metadata_json"], str):
            d["metadata"] = json.loads(d["metadata_json"])
        else:
            d["metadata"] = {}
        return d

    # ──────────────────────────────────────────────
    # Runs
    # ──────────────────────────────────────────────

    def create_run(
        self,
        swarm_id: str,
        trigger_source: str,
        created_by_trigger: Optional[str] = None,
    ) -> str:
        run_id = _new_id("run")
        now = _now()
        self.conn.execute(
            """INSERT INTO swarm_runs
                (run_id, swarm_id, trigger_source, run_status,
                 delivery_status, triggered_at, created_by_trigger)
            VALUES (?, ?, ?, 'queued', 'not_applicable', ?, ?)""",
            (run_id, swarm_id, trigger_source, now, created_by_trigger),
        )
        self.conn.execute(
            "UPDATE swarms SET latest_run_id = ?, updated_at = ? WHERE swarm_id = ?",
            (run_id, now, swarm_id),
        )
        self._commit()
        return run_id

    def get_run(self, run_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM swarm_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        return dict(row) if row else None

    def update_run(self, run_id: str, **fields: Any) -> None:
        if not fields:
            return
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [run_id]
        self.conn.execute(
            f"UPDATE swarm_runs SET {set_clause} WHERE run_id = ?", values,
        )
        self._commit()

    def list_runs(self, swarm_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM swarm_runs WHERE swarm_id = ? ORDER BY triggered_at DESC",
            (swarm_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def list_all_runs(
        self, status: Optional[str] = None, limit: int = 100,
    ) -> list[dict]:
        if status:
            rows = self.conn.execute(
                "SELECT * FROM swarm_runs WHERE run_status = ? "
                "ORDER BY triggered_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM swarm_runs ORDER BY triggered_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_run_action_results(self, run_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM run_action_results WHERE run_id = ? ORDER BY step_order",
            (run_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def create_run_action_result(
        self,
        run_id: str,
        action_id: str,
        step_order: int,
        execution_status: str,
        tool_id: Optional[str] = None,
        artifact_ref: Optional[str] = None,
        started_at: Optional[str] = None,
        completed_at: Optional[str] = None,
        error_summary: Optional[str] = None,
    ) -> str:
        result_id = _new_id("rar")
        self.conn.execute(
            """INSERT INTO run_action_results
                (run_action_result_id, run_id, action_id, step_order,
                 execution_status, tool_id, artifact_ref, started_at,
                 completed_at, error_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (result_id, run_id, action_id, step_order, execution_status,
             tool_id, artifact_ref, started_at, completed_at, error_summary),
        )
        self._commit()
        return result_id

    def create_artifact_ref(
        self,
        owner_type: str,
        owner_id: str,
        artifact_kind: str,
        artifact_path: str,
        digest: Optional[str] = None,
        signer_role: Optional[str] = None,
    ) -> str:
        artifact_ref_id = _new_id("aref")
        self.conn.execute(
            """INSERT INTO artifact_refs
                (artifact_ref_id, owner_type, owner_id, artifact_kind,
                 artifact_path, digest, signer_role, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (artifact_ref_id, owner_type, owner_id, artifact_kind,
             artifact_path, digest, signer_role, _now()),
        )
        self._commit()
        return artifact_ref_id

    def get_artifact_refs(self, owner_type: str, owner_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM artifact_refs WHERE owner_type = ? AND owner_id = ? "
            "ORDER BY created_at",
            (owner_type, owner_id),
        ).fetchall()
        return [dict(r) for r in rows]

    # ──────────────────────────────────────────────
    # Delivery receipts
    # ──────────────────────────────────────────────

    def create_delivery_receipt(
        self,
        run_id: str,
        delivery_id: str,
        delivery_type: str,
        status: str,
        provider_message_id: Optional[str] = None,
        provider_response_summary: Optional[str] = None,
    ) -> str:
        receipt_id = _new_id("rcpt")
        now = _now()
        self.conn.execute(
            """INSERT INTO delivery_receipts
                (receipt_id, run_id, delivery_id, delivery_type,
                 sent_at, delivery_status, provider_message_id,
                 provider_response_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (receipt_id, run_id, delivery_id, delivery_type,
             now, status, provider_message_id, provider_response_summary),
        )
        self._commit()
        return receipt_id

    def get_delivery_receipt(self, receipt_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM delivery_receipts WHERE receipt_id = ?",
            (receipt_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Events
    # ──────────────────────────────────────────────

    def record_event(
        self,
        swarm_id: str,
        event_type: str,
        actor_id: str,
        summary: str,
        details: Optional[dict] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
    ) -> str:
        event_id = _new_id("evt")
        now = _now()
        self.conn.execute(
            """INSERT INTO swarm_events
                (event_id, swarm_id, event_type, event_time, actor_id,
                 summary, details_json, related_entity_type, related_entity_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event_id, swarm_id, event_type, now, actor_id, summary,
             json.dumps(details) if details else None,
             related_entity_type, related_entity_id),
        )
        self._commit()
        return event_id

    def list_events(
        self, swarm_id: str, event_type: Optional[str] = None,
    ) -> list[dict]:
        if event_type:
            rows = self.conn.execute(
                "SELECT * FROM swarm_events WHERE swarm_id = ? AND event_type = ? "
                "ORDER BY event_time ASC",
                (swarm_id, event_type),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM swarm_events WHERE swarm_id = ? ORDER BY event_time ASC",
                (swarm_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def list_all_events(
        self, event_type: Optional[str] = None, limit: int = 200,
    ) -> list[dict]:
        if event_type:
            rows = self.conn.execute(
                "SELECT * FROM swarm_events WHERE event_type = ? "
                "ORDER BY event_time DESC LIMIT ?",
                (event_type, limit),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM swarm_events ORDER BY event_time DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    # ──────────────────────────────────────────────
    # Tool Registry
    # ──────────────────────────────────────────────

    def create_tool(
        self,
        tool_name: str,
        description: str,
        tool_family: Optional[str] = None,
        schema_ref: Optional[str] = None,
        allowed_scope_class: Optional[str] = None,
        execution_class: Optional[str] = None,
        maturity_status: str = "active",
        supports_dry_run: bool = False,
    ) -> str:
        tool_id = _new_id("tool")
        now = _now()
        self.conn.execute(
            """INSERT INTO tool_registry
                (tool_id, tool_name, description, tool_family,
                 schema_ref, allowed_scope_class, execution_class,
                 maturity_status, supports_dry_run, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (tool_id, tool_name, description, tool_family,
             schema_ref, allowed_scope_class, execution_class,
             maturity_status, 1 if supports_dry_run else 0, now, now),
        )
        self._commit()
        return tool_id

    def get_tool(self, tool_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM tool_registry WHERE tool_id = ?", (tool_id,)
        ).fetchone()
        return dict(row) if row else None

    def get_tool_by_name(self, tool_name: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM tool_registry WHERE tool_name = ?", (tool_name,)
        ).fetchone()
        return dict(row) if row else None

    def list_tools(self, status: Optional[str] = None) -> list[dict]:
        if status:
            rows = self.conn.execute(
                "SELECT * FROM tool_registry WHERE maturity_status = ? ORDER BY tool_name",
                (status,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM tool_registry ORDER BY tool_name",
            ).fetchall()
        return [dict(r) for r in rows]

    def update_tool(self, tool_id: str, **fields: Any) -> None:
        if not fields:
            return
        fields["updated_at"] = _now()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [tool_id]
        self.conn.execute(
            f"UPDATE tool_registry SET {set_clause} WHERE tool_id = ?", values,
        )
        self._commit()

    # ──────────────────────────────────────────────
    # Swarm Actions
    # ──────────────────────────────────────────────

    def create_action(
        self,
        swarm_id: str,
        step_order: int,
        action_name: str,
        action_text: str,
        action_type: Optional[str] = None,
        target_path: Optional[str] = None,
        output_artifact_type: Optional[str] = None,
        action_status: str = "draft",
    ) -> str:
        action_id = _new_id("act")
        now = _now()
        self.conn.execute(
            """INSERT INTO swarm_actions
                (action_id, swarm_id, step_order, action_name, action_text,
                 action_type, target_path, output_artifact_type,
                 action_status, requires_user_confirmation,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (action_id, swarm_id, step_order, action_name, action_text,
             action_type, target_path, output_artifact_type,
             action_status, now, now),
        )
        self._commit()
        return action_id

    def get_action(self, action_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM swarm_actions WHERE action_id = ?", (action_id,)
        ).fetchone()
        return dict(row) if row else None

    def list_actions(self, swarm_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM swarm_actions WHERE swarm_id = ? ORDER BY step_order ASC",
            (swarm_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def update_action(self, action_id: str, **fields: Any) -> None:
        if not fields:
            return
        fields["updated_at"] = _now()
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [action_id]
        self.conn.execute(
            f"UPDATE swarm_actions SET {set_clause} WHERE action_id = ?", values,
        )
        self._commit()

    def delete_actions_for_swarm(self, swarm_id: str) -> int:
        cursor = self.conn.execute(
            "DELETE FROM swarm_actions WHERE swarm_id = ?", (swarm_id,),
        )
        self._commit()
        return cursor.rowcount

    # ──────────────────────────────────────────────
    # Action Dependencies
    # ──────────────────────────────────────────────

    def create_action_dependency(
        self, swarm_id: str, action_id: str, depends_on_action_id: str,
    ) -> str:
        dep_id = _new_id("dep")
        self.conn.execute(
            """INSERT INTO swarm_action_dependencies
                (dependency_id, swarm_id, action_id, depends_on_action_id)
            VALUES (?, ?, ?, ?)""",
            (dep_id, swarm_id, action_id, depends_on_action_id),
        )
        self._commit()
        return dep_id

    def list_action_dependencies(self, action_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM swarm_action_dependencies WHERE action_id = ?",
            (action_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def delete_dependencies_for_swarm(self, swarm_id: str) -> int:
        cursor = self.conn.execute(
            "DELETE FROM swarm_action_dependencies WHERE swarm_id = ?",
            (swarm_id,),
        )
        self._commit()
        return cursor.rowcount

    # ──────────────────────────────────────────────
    # Action Tool Readiness
    # ──────────────────────────────────────────────

    def create_readiness_check(
        self,
        action_id: str,
        match_status: str,
        tool_id: Optional[str] = None,
        confidence_score: Optional[float] = None,
        constraint_notes: Optional[str] = None,
        reviewer_notes: Optional[str] = None,
        checked_by: Optional[str] = None,
    ) -> str:
        readiness_id = _new_id("rdy")
        now = _now()
        requires_new = 1 if match_status == "requires_new_tool" else 0
        self.conn.execute(
            """INSERT INTO action_tool_readiness
                (readiness_id, action_id, tool_id, match_status,
                 confidence_score, requires_new_tool,
                 constraint_notes, reviewer_notes,
                 checked_at, checked_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (readiness_id, action_id, tool_id, match_status,
             confidence_score, requires_new,
             constraint_notes, reviewer_notes, now, checked_by),
        )
        self._commit()
        return readiness_id

    def get_latest_readiness(self, action_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM action_tool_readiness WHERE action_id = ? "
            "ORDER BY checked_at DESC LIMIT 1",
            (action_id,),
        ).fetchone()
        return dict(row) if row else None

    def list_readiness_for_swarm(self, swarm_id: str) -> list[dict]:
        rows = self.conn.execute(
            """SELECT a.action_id, a.step_order, a.action_name,
                   a.action_text, a.action_type, a.target_path,
                   a.action_status,
                   r.readiness_id, r.tool_id, r.match_status,
                   r.confidence_score, r.constraint_notes,
                   r.checked_at, r.checked_by,
                   t.tool_name, t.description AS tool_description
            FROM swarm_actions a
            LEFT JOIN action_tool_readiness r ON a.action_id = r.action_id
                AND r.checked_at = (
                    SELECT MAX(r2.checked_at)
                    FROM action_tool_readiness r2
                    WHERE r2.action_id = a.action_id
                )
            LEFT JOIN tool_registry t ON r.tool_id = t.tool_id
            WHERE a.swarm_id = ?
            ORDER BY a.step_order ASC""",
            (swarm_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ──────────────────────────────────────────────
    # Intent Archetypes
    # ──────────────────────────────────────────────

    def create_intent_archetype(
        self,
        intent_id: str,
        swarm_archetype: str,
        complexity_class: str = "moderate",
        decomposition_required: bool = True,
        confidence: float = 0.0,
        reasoning: str | None = None,
        source: str = "rules",
    ) -> str:
        archetype_id = _new_id("arch")
        now = _now()
        self.conn.execute(
            """INSERT INTO intent_archetypes
                (archetype_id, intent_id, swarm_archetype, complexity_class,
                 decomposition_required, confidence, reasoning, source,
                 created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (archetype_id, intent_id, swarm_archetype, complexity_class,
             1 if decomposition_required else 0, confidence, reasoning,
             source, now),
        )
        self._commit()
        return archetype_id

    def get_intent_archetype(self, archetype_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM intent_archetypes WHERE archetype_id = ?",
            (archetype_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_intent_archetype_by_intent(self, intent_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM intent_archetypes WHERE intent_id = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (intent_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Constraint Sets
    # ──────────────────────────────────────────────

    def create_constraint_set(
        self,
        intent_id: str,
        constraints_json: str,
        extraction_notes: str | None = None,
        action_table_ref: str | None = None,
        archetype_ref: str | None = None,
        artifact_type: str = "constraint_set",
        missing_required: Optional[list[str]] = None,
        ambiguous_fields: Optional[list[str]] = None,
        clarification_questions: Optional[list[str]] = None,
        extraction_method: str | None = None,
        resolution_state: str | None = None,
    ) -> str:
        constraint_set_id = _new_id("cset")
        now = _now()
        self.conn.execute(
            """INSERT INTO constraint_sets
                (constraint_set_id, intent_id, action_table_ref,
                 archetype_ref, artifact_type, constraints_json,
                 extraction_notes, missing_required_json,
                 ambiguous_fields_json, clarification_questions_json,
                 extraction_method, resolution_state, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                constraint_set_id, intent_id, action_table_ref,
                archetype_ref, artifact_type, constraints_json,
                extraction_notes,
                json.dumps(missing_required) if missing_required is not None else None,
                json.dumps(ambiguous_fields) if ambiguous_fields is not None else None,
                json.dumps(clarification_questions) if clarification_questions is not None else None,
                extraction_method, resolution_state, now,
            ),
        )
        self._commit()
        return constraint_set_id

    def get_constraint_set(self, constraint_set_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM constraint_sets WHERE constraint_set_id = ?",
            (constraint_set_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_constraint_set_by_intent(self, intent_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM constraint_sets WHERE intent_id = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (intent_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_constraint_set_by_action_table(
        self, action_table_ref: str
    ) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM constraint_sets WHERE action_table_ref = ? "
            "ORDER BY created_at DESC LIMIT 1",
            (action_table_ref,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Action Table Acceptances
    # ──────────────────────────────────────────────

    def create_action_table_acceptance(
        self,
        swarm_id: str,
        accepted_by: str,
        action_count: int,
        tool_readiness_summary: str | None = None,
        notes: str | None = None,
        action_table_ref: str | None = None,
        tool_match_set_ref: str | None = None,
    ) -> str:
        acceptance_id = _new_id("atacc")
        now = _now()
        self.conn.execute(
            """INSERT INTO action_table_acceptances
                (acceptance_id, swarm_id, accepted_by, accepted_at,
                 acceptance_mode, action_count, tool_readiness_summary,
                 notes, action_table_ref, tool_match_set_ref)
            VALUES (?, ?, ?, ?, 'explicit_button', ?, ?, ?, ?, ?)""",
            (acceptance_id, swarm_id, accepted_by, now,
             action_count, tool_readiness_summary, notes,
             action_table_ref, tool_match_set_ref),
        )
        self._commit()
        return acceptance_id

    def get_action_table_acceptance(self, acceptance_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM action_table_acceptances WHERE acceptance_id = ?",
            (acceptance_id,),
        ).fetchone()
        return dict(row) if row else None

    def get_action_table_acceptance_by_swarm(
        self, swarm_id: str
    ) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM action_table_acceptances WHERE swarm_id = ? "
            "ORDER BY accepted_at DESC LIMIT 1",
            (swarm_id,),
        ).fetchone()
        return dict(row) if row else None

    # ──────────────────────────────────────────────
    # Governance warning records
    # ──────────────────────────────────────────────

    def create_governance_warning_record(self, record: dict[str, Any]) -> str:
        warning_id = record.get("warning_id") or _new_id("warn")
        self.conn.execute(
            """INSERT INTO governance_warning_records
                (warning_id, swarm_id, run_id, warning_family, severity,
                 trigger_stage, message, details, boundary_at_risk,
                 assurance_posture_before, assurance_posture_after,
                 impact_summary, safer_alternative, proceeding_means,
                 affected_artifact_refs_json, affected_swarm_ref,
                 affected_run_ref, policy_refs_json, evidence_refs_json,
                 operator_decision, override_required,
                 override_reason_category, override_reason,
                 decision_fingerprint, actor_id, actor_role, created_at,
                 acknowledged_at, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                warning_id,
                record.get("swarm_id"),
                record.get("run_id"),
                record["warning_family"],
                record["severity"],
                record["trigger_stage"],
                record["message"],
                record.get("details"),
                record["boundary_at_risk"],
                record.get("assurance_posture_before"),
                record.get("assurance_posture_after"),
                record.get("impact_summary"),
                record.get("safer_alternative"),
                record.get("proceeding_means"),
                json.dumps(record.get("affected_artifact_refs", [])),
                record.get("affected_swarm_ref"),
                record.get("affected_run_ref"),
                json.dumps(record.get("policy_refs", [])),
                json.dumps(record.get("evidence_refs", [])),
                record["operator_decision"],
                1 if record.get("override_required") else 0,
                record.get("override_reason_category"),
                record.get("override_reason"),
                record["decision_fingerprint"],
                record["actor_id"],
                record.get("actor_role"),
                record.get("created_at", _now()),
                record.get("acknowledged_at"),
                record.get("notes"),
            ),
        )
        self._commit()
        return warning_id

    def get_governance_warning_record(self, warning_id: str) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM governance_warning_records WHERE warning_id = ?",
            (warning_id,),
        ).fetchone()
        return self._decode_governance_warning_row(row)

    def list_governance_warning_records(
        self,
        swarm_id: Optional[str] = None,
        run_id: Optional[str] = None,
        warning_family: Optional[str] = None,
        limit: int = 200,
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if swarm_id:
            clauses.append("swarm_id = ?")
            params.append(swarm_id)
        if run_id:
            clauses.append("run_id = ?")
            params.append(run_id)
        if warning_family:
            clauses.append("warning_family = ?")
            params.append(warning_family)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.conn.execute(
            f"SELECT * FROM governance_warning_records {where} "
            "ORDER BY created_at DESC LIMIT ?",
            (*params, limit),
        ).fetchall()
        return [self._decode_governance_warning_row(r) for r in rows]

    # ──────────────────────────────────────────────
    # Reduced-assurance governance events
    # ──────────────────────────────────────────────

    def create_reduced_assurance_governance_event(
        self, event: dict[str, Any]
    ) -> str:
        event_id = event.get("event_id") or _new_id("raeg")
        self.conn.execute(
            """INSERT INTO reduced_assurance_governance_events
                (event_id, swarm_id, run_id, governance_action_type,
                 reduction_type, assurance_posture_before,
                 assurance_posture_after, reason_summary, reason_details,
                 normal_expected_governance, actual_governance_path,
                 compensating_controls_json, affected_artifact_refs_json,
                 affected_run_ref, policy_refs_json, warning_record_ref,
                 actor_id, actor_role, acknowledged_by, acknowledged_at,
                 created_at, expires_at, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event_id,
                event.get("swarm_id"),
                event.get("run_id"),
                event["governance_action_type"],
                event["reduction_type"],
                event["assurance_posture_before"],
                event["assurance_posture_after"],
                event["reason_summary"],
                event.get("reason_details"),
                event.get("normal_expected_governance"),
                event.get("actual_governance_path"),
                json.dumps(event.get("compensating_controls", [])),
                json.dumps(event.get("affected_artifact_refs", [])),
                event.get("affected_run_ref"),
                json.dumps(event.get("policy_refs", [])),
                event.get("warning_record_ref"),
                event["actor_id"],
                event.get("actor_role"),
                event.get("acknowledged_by"),
                event.get("acknowledged_at"),
                event.get("created_at", _now()),
                event.get("expires_at"),
                event.get("notes"),
            ),
        )
        self._commit()
        return event_id

    def get_reduced_assurance_governance_event(
        self, event_id: str
    ) -> dict | None:
        row = self.conn.execute(
            "SELECT * FROM reduced_assurance_governance_events WHERE event_id = ?",
            (event_id,),
        ).fetchone()
        return self._decode_reduced_assurance_row(row)

    def list_reduced_assurance_governance_events(
        self,
        swarm_id: Optional[str] = None,
        run_id: Optional[str] = None,
        limit: int = 200,
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if swarm_id:
            clauses.append("swarm_id = ?")
            params.append(swarm_id)
        if run_id:
            clauses.append("run_id = ?")
            params.append(run_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.conn.execute(
            f"SELECT * FROM reduced_assurance_governance_events {where} "
            "ORDER BY created_at DESC LIMIT ?",
            (*params, limit),
        ).fetchall()
        return [self._decode_reduced_assurance_row(r) for r in rows]

    # ──────────────────────────────────────────────
    # Governance helpers
    # ──────────────────────────────────────────────

    def get_actor_roles_for_swarm(
        self, swarm_id: str, actor_id: str
    ) -> set[str]:
        roles: set[str] = set()
        swarm = self.get_swarm(swarm_id)
        if swarm and swarm.get("created_by") == actor_id:
            roles.add("author")
        rows = self.conn.execute(
            "SELECT details_json FROM swarm_events "
            "WHERE swarm_id = ? AND actor_id = ? ORDER BY event_time ASC",
            (swarm_id, actor_id),
        ).fetchall()
        for row in rows:
            raw = row["details_json"]
            if raw:
                try:
                    details = json.loads(raw)
                except json.JSONDecodeError:
                    details = {}
                role = details.get("actor_role")
                if role:
                    roles.add(role)
        return roles

    @staticmethod
    def _decode_governance_warning_row(row: Any) -> dict | None:
        if not row:
            return None
        result = dict(row)
        for key in (
            "affected_artifact_refs_json",
            "policy_refs_json",
            "evidence_refs_json",
        ):
            value = result.pop(key, None)
            target = key.replace("_json", "")
            result[target] = json.loads(value) if value else []
        result["override_required"] = bool(result.get("override_required"))
        return result

    @staticmethod
    def _decode_reduced_assurance_row(row: Any) -> dict | None:
        if not row:
            return None
        result = dict(row)
        for key in (
            "compensating_controls_json",
            "affected_artifact_refs_json",
            "policy_refs_json",
        ):
            value = result.pop(key, None)
            target = key.replace("_json", "")
            result[target] = json.loads(value) if value else []
        return result
