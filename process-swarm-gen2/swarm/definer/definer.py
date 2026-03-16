"""Swarm Definer — intent clarification loop.

Converts natural language intent into structured swarm definitions
through a multi-step clarification process:

  1. Draft — raw intent text captured
  2. Restate — structured steps, outputs, and constraints generated
  3. Accept — human explicitly accepts the restatement
  4. Define — swarm definition created from accepted intent

The Definer ensures that natural language never reaches the
runtime directly. All intent must become structured artifacts
before it can influence execution.
"""

from __future__ import annotations

import json
from typing import Optional

from swarm.definer.action_extraction import (
    action_summary_from_tuples,
    extract_action_tuples,
)
from swarm.definer.archetype_classifier import classify_action_table
from swarm.registry.repository import SwarmRepository

from swarm.governance.warnings import (
    evaluate_semantic_ambiguity,
    persist_warning_records,
    summarize_warnings,
)


class SwarmDefiner:
    """Orchestrates the intent -> swarm definition clarification loop.

    Implements the Swarm Definer UX Flow from the architecture spec:
      draft -> restate -> accept -> define

    Each step produces artifacts recorded in the registry.
    """

    def __init__(
        self,
        repo: SwarmRepository,
        events: object | None = None,
    ):
        self.repo = repo
        self.events = events

    def _emit(self, method: str, *args: object, **kwargs: object) -> None:
        """Emit an event if the event recorder is available."""
        if self.events and hasattr(self.events, method):
            getattr(self.events, method)(*args, **kwargs)

    def create_draft(
        self,
        swarm_id: str,
        raw_text: str,
        created_by: str,
        session_id: Optional[str] = None,
        parent_draft_id: Optional[str] = None,
        revision_index: int = 0,
    ) -> str:
        """Capture raw intent text as a draft artifact."""
        if not raw_text or not raw_text.strip():
            raise ValueError("Intent text cannot be empty")

        draft_id = self.repo.create_intent_draft(
            swarm_id=swarm_id,
            raw_text=raw_text,
            created_by=created_by,
            revision_index=revision_index,
            parent_draft_id=parent_draft_id,
            session_id=session_id,
        )

        self._emit("draft_created", swarm_id, draft_id, created_by)
        return draft_id

    def create_restatement(
        self,
        swarm_id: str,
        draft_id: str,
        summary: str,
        structured_steps: list[dict],
        actor_id: str,
        expected_outputs: Optional[list[str]] = None,
        inferred_constraints: Optional[dict] = None,
    ) -> str:
        """Generate a structured restatement of the draft intent."""
        draft = self.repo.get_intent_draft(draft_id)
        if not draft:
            raise ValueError(f"Draft not found: {draft_id}")

        if not structured_steps:
            raise ValueError("Structured steps cannot be empty")

        if not summary or not summary.strip():
            raise ValueError("Summary cannot be empty")

        extraction = extract_action_tuples(draft["raw_intent_text"])
        clarification_history = self.repo.list_intent_clarifications(
            draft_id=draft_id
        )

        restatement_id = self.repo.create_restatement(
            draft_id=draft_id,
            summary=summary,
            structured_steps=structured_steps,
            expected_outputs=expected_outputs,
            inferred_constraints=inferred_constraints,
            extracted_actions=extraction["actions"],
            dependency_graph=extraction["dependency_graph"],
            unresolved_issues=extraction["unresolved_issues"],
            clarification_history=clarification_history,
        )

        self._emit("restatement_generated", swarm_id, restatement_id, actor_id)
        return restatement_id

    def extract_actions(
        self,
        swarm_id: str,
        draft_id: str,
        actor_id: str,
    ) -> dict:
        """Extract explicit action tuples from a draft and record issues."""
        draft = self.repo.get_intent_draft(draft_id)
        if not draft:
            raise ValueError(f"Draft not found: {draft_id}")

        extraction = extract_action_tuples(draft["raw_intent_text"])
        for issue in extraction["unresolved_issues"]:
            self.repo.create_intent_clarification(
                swarm_id=swarm_id,
                draft_id=draft_id,
                restatement_id=None,
                action_index=issue.get("action_index"),
                issue_type=issue["issue_type"],
                question_text=issue.get("question_text") or issue["message"],
                response_text=None,
                resolution_status="open",
                created_by=actor_id,
            )
        return extraction

    def _build_current_extraction_state(
        self,
        swarm_id: str,
        draft_id: str,
    ) -> dict:
        """Apply recorded clarification responses to the current extraction."""
        draft = self.repo.get_intent_draft(draft_id)
        if not draft:
            raise ValueError(f"Draft not found: {draft_id}")

        extraction = extract_action_tuples(draft["raw_intent_text"])
        actions = extraction["actions"]
        unresolved = extraction["unresolved_issues"]
        history = self.repo.list_intent_clarifications(
            swarm_id=swarm_id,
            draft_id=draft_id,
        )

        for record in reversed(history):
            if not record.get("response_text"):
                continue
            try:
                response = json.loads(record["response_text"])
            except (TypeError, json.JSONDecodeError):
                response = {"response_text": record["response_text"]}

            action_index = record.get("action_index")
            action = None
            if action_index is not None:
                for candidate in actions:
                    if candidate.get("step") == action_index:
                        action = candidate
                        break

            issue_type = record.get("issue_type")
            if issue_type == "manual_action_edit":
                if action:
                    for key, value in response.items():
                        if key in {"qualifiers", "conditions", "dependencies"} and value is not None:
                            if key == "qualifiers":
                                existing_q = action.get("qualifiers")
                                if isinstance(existing_q, dict) and isinstance(value, dict):
                                    existing_q.update(value)
                                else:
                                    action["qualifiers"] = value
                            else:
                                action[key] = value
                        elif key != "step":
                            action[key] = value
            elif issue_type == "manual_action_add":
                existing = next(
                    (c for c in actions if c.get("step") == action_index),
                    None,
                )
                if existing:
                    for key, value in response.items():
                        if key != "step":
                            existing[key] = value
                else:
                    actions.append({
                        "step": action_index,
                        "verb": response.get("verb", ""),
                        "object": response.get("object", ""),
                        "destination": response.get("destination"),
                        "qualifiers": response.get("qualifiers", {}),
                        "dependencies": response.get("dependencies", []),
                        "conditions": response.get("conditions", []),
                        "source_text": response.get("source_text"),
                        "source_reference": f"clarification:{record['clarification_id']}",
                    })
            elif issue_type == "missing_object" and action:
                action["object"] = (
                    response.get("object")
                    or response.get("resolved_object")
                    or response.get("response_text")
                    or action.get("object")
                )
            elif issue_type == "missing_verb":
                if action:
                    action["verb"] = (
                        response.get("verb")
                        or response.get("resolved_verb")
                        or response.get("response_text")
                        or action.get("verb")
                    )
                elif action_index is not None:
                    actions.append({
                        "step": action_index,
                        "verb": (
                            response.get("verb")
                            or response.get("resolved_verb")
                            or response.get("response_text")
                            or "clarified_action"
                        ),
                        "object": response.get("object", ""),
                        "destination": response.get("destination"),
                        "qualifiers": response.get("qualifiers", {}),
                        "dependencies": response.get("dependencies", []),
                        "conditions": response.get("conditions", []),
                        "source_text": response.get("source_text"),
                        "source_reference": f"clarification:{record['clarification_id']}",
                    })
            elif issue_type == "ambiguous_verb" and action:
                action["verb"] = (
                    response.get("verb")
                    or response.get("resolved_verb")
                    or response.get("response_text")
                    or action.get("verb")
                )
                if response.get("object"):
                    action["object"] = response["object"]
            elif issue_type == "unresolved_reference" and action:
                action["object"] = (
                    response.get("object")
                    or response.get("resolved_object")
                    or response.get("response_text")
                    or action.get("object")
                )

            for f in ("destination", "source_text"):
                if action and response.get(f):
                    action[f] = response[f]
            if action and response.get("qualifiers"):
                existing_q = action.get("qualifiers")
                if isinstance(existing_q, dict) and isinstance(response["qualifiers"], dict):
                    existing_q.update(response["qualifiers"])
                else:
                    action["qualifiers"] = response["qualifiers"]

            if record.get("resolution_status") == "resolved":
                unresolved = [
                    issue for issue in unresolved
                    if not (
                        issue.get("issue_type") == issue_type
                        and issue.get("action_index") == action_index
                    )
                ]

        actions = sorted(actions, key=lambda item: item.get("step", 0))
        dependency_graph = {
            "nodes": [a["step"] for a in actions],
            "edges": [
                {"step": a["step"], "depends_on": dep}
                for a in actions
                for dep in a.get("dependencies", [])
            ],
        }
        completeness = next(
            (
                record for record in history
                if record.get("issue_type") == "completeness_confirmation"
                and record.get("response_text")
            ),
            None,
        )
        confirmed_complete = False
        if completeness:
            try:
                confirmed_complete = bool(
                    json.loads(completeness["response_text"]).get("confirmed")
                )
            except (TypeError, json.JSONDecodeError, AttributeError):
                confirmed_complete = False
        return {
            "actions": actions,
            "unresolved_issues": unresolved,
            "dependency_graph": dependency_graph,
            "clarification_history": history,
            "can_proceed": len(unresolved) == 0 and len(actions) > 0,
            "user_confirmation": confirmed_complete,
            "user_confirmation_required": not confirmed_complete,
        }

    def submit_clarification_response(
        self,
        swarm_id: str,
        draft_id: str,
        actor_id: str,
        clarification_id: str | None = None,
        action_index: int | None = None,
        issue_type: str | None = None,
        response: Optional[dict] = None,
    ) -> dict:
        """Persist a clarification response and return the updated intake state."""
        draft = self.repo.get_intent_draft(draft_id)
        if not draft:
            raise ValueError(f"Draft not found: {draft_id}")

        target = None
        if clarification_id:
            target = self.repo.get_intent_clarification(clarification_id)
            if not target:
                raise ValueError(f"Clarification not found: {clarification_id}")
            issue_type = target["issue_type"]
            action_index = target["action_index"]

        if not issue_type:
            raise ValueError("'issue_type' is required")
        if response is None:
            raise ValueError("'response' is required")

        self.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=target["restatement_id"] if target else None,
            action_index=action_index,
            issue_type=issue_type,
            question_text=(
                target["question_text"]
                if target else
                f"Clarification response for {issue_type}"
            ),
            response_text=json.dumps(response),
            resolution_status="resolved",
            created_by=actor_id,
        )
        return self._build_current_extraction_state(swarm_id, draft_id)

    def update_extracted_action(
        self,
        swarm_id: str,
        draft_id: str,
        actor_id: str,
        step: int,
        updates: dict,
    ) -> dict:
        """Record a manual edit to an extracted action and return updated state."""
        if not updates:
            raise ValueError("'updates' is required")
        self.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="manual_action_edit",
            question_text="Manual action edit",
            response_text=json.dumps(updates),
            resolution_status="resolved",
            created_by=actor_id,
        )
        return self._build_current_extraction_state(swarm_id, draft_id)

    def add_extracted_action(
        self,
        swarm_id: str,
        draft_id: str,
        actor_id: str,
        action: dict,
    ) -> dict:
        """Record a manually added action and return updated state."""
        if not action:
            raise ValueError("'action' is required")
        current = self._build_current_extraction_state(swarm_id, draft_id)
        step = action.get("step")
        if step is None:
            existing_steps = [item.get("step", 0) for item in current["actions"]]
            step = (max(existing_steps) if existing_steps else 0) + 1
            action = {**action, "step": step}
        self.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=step,
            issue_type="manual_action_add",
            question_text="Manual action add",
            response_text=json.dumps(action),
            resolution_status="resolved",
            created_by=actor_id,
        )
        return self._build_current_extraction_state(swarm_id, draft_id)

    def confirm_action_completeness(
        self,
        swarm_id: str,
        draft_id: str,
        actor_id: str,
        confirmed: bool = True,
    ) -> dict:
        """Record explicit user confirmation that extracted actions are complete."""
        self.repo.create_intent_clarification(
            swarm_id=swarm_id,
            draft_id=draft_id,
            restatement_id=None,
            action_index=None,
            issue_type="completeness_confirmation",
            question_text="Are the extracted actions complete?",
            response_text=json.dumps({"confirmed": confirmed}),
            resolution_status="resolved" if confirmed else "open",
            created_by=actor_id,
        )
        state = self._build_current_extraction_state(swarm_id, draft_id)
        state["user_confirmation"] = confirmed
        state["user_confirmation_required"] = not confirmed
        return state

    def preview_restatement_from_actions(
        self,
        swarm_id: str,
        draft_id: str,
        actor_id: str,
    ) -> dict:
        """Preview a restatement derived from extracted actions."""
        extraction = self._build_current_extraction_state(swarm_id, draft_id)
        structured_steps = []
        for action in extraction["actions"]:
            step = {
                "op": action["verb"],
                "target": action["object"],
            }
            if action.get("destination"):
                step["destination"] = action["destination"]
            structured_steps.append(step)
        return {
            "summary": action_summary_from_tuples(extraction["actions"]),
            "structured_steps": structured_steps,
            "extracted_actions": extraction["actions"],
            "dependency_graph": extraction["dependency_graph"],
            "unresolved_issues": extraction["unresolved_issues"],
            "clarification_history": self.repo.list_intent_clarifications(
                draft_id=draft_id
            ),
            "user_confirmation_required": extraction["user_confirmation_required"],
            "user_confirmation": extraction["user_confirmation"],
            "can_proceed": extraction["can_proceed"],
        }

    def accept_intent(
        self,
        swarm_id: str,
        restatement_id: str,
        accepted_by: str,
        mode: str = "explicit_button",
        note: Optional[str] = None,
        warning_ids: Optional[list[str]] = None,
        override_reason_category: Optional[str] = None,
        override_reason: Optional[str] = None,
    ) -> str:
        """Accept a restatement, completing the clarification loop.

        This is the critical human-in-the-loop step. Only after
        explicit acceptance can the intent proceed toward execution.
        """
        restatement = self.repo.get_restatement(restatement_id)
        if not restatement:
            raise ValueError(f"Restatement not found: {restatement_id}")

        if restatement["status"] == "accepted":
            raise ValueError(
                f"Restatement {restatement_id} is already accepted"
            )

        # Governance warning evaluation
        evaluation = self.evaluate_pre_acceptance(
            swarm_id=swarm_id,
            restatement_id=restatement_id,
            actor_id=accepted_by,
        )
        current_blocks = [
            w for w in evaluation["governance_warnings"]
            if w["severity"] == "block"
        ]
        current_warns = [
            w for w in evaluation["governance_warnings"]
            if w["severity"] == "warn"
        ]
        if current_blocks:
            persist_warning_records(
                self.repo, self.events, current_blocks,
                operator_decision="blocked_by_system",
            )
            raise ValueError(
                "Intent acceptance blocked by governance warnings"
            )
        if current_warns:
            warning_ids = warning_ids or []
            provided_fingerprints = set()
            for wid in warning_ids:
                record = self.repo.get_governance_warning_record(wid)
                if record:
                    provided_fingerprints.add(record["decision_fingerprint"])

            missing = [
                w for w in current_warns
                if w["decision_fingerprint"] not in provided_fingerprints
            ]
            if missing:
                persist_warning_records(
                    self.repo, self.events, missing,
                    operator_decision="deferred",
                )
                raise ValueError(
                    "Explicit governance warning acknowledgment is required "
                    "before intent acceptance"
                )
            persist_warning_records(
                self.repo, self.events, current_warns,
                operator_decision="acknowledged_and_proceeded",
                override_reason_category=override_reason_category,
                override_reason=override_reason,
                acknowledged=True,
            )

        unresolved_raw = restatement.get("unresolved_issues_json")
        unresolved_issues = json.loads(unresolved_raw) if unresolved_raw else []
        if unresolved_issues:
            raise ValueError(
                "Intent acceptance requires all extracted actions and "
                "references to be resolved"
            )

        accepted_actions_raw = restatement.get("extracted_actions_json")
        accepted_actions = (
            json.loads(accepted_actions_raw) if accepted_actions_raw else []
        )
        if not accepted_actions:
            raise ValueError(
                "Intent acceptance requires extracted actions before proceeding"
            )

        dependency_graph_raw = restatement.get("dependency_graph_json")
        clarification_history_raw = restatement.get("clarification_history_json")
        dependency_graph = (
            json.loads(dependency_graph_raw) if dependency_graph_raw else {}
        )
        clarification_history = (
            json.loads(clarification_history_raw)
            if clarification_history_raw else
            self.repo.list_intent_clarifications(
                swarm_id=swarm_id,
                draft_id=restatement["draft_id"],
                restatement_id=restatement_id,
            )
        )

        acceptance_id = self.repo.accept_intent(
            restatement_id=restatement_id,
            accepted_by=accepted_by,
            mode=mode,
            note=note,
            accepted_actions=accepted_actions,
            dependency_graph=dependency_graph,
            clarification_history=clarification_history,
            user_confirmation="confirmed_complete",
        )

        action_table_id = self.repo.create_action_table(
            swarm_id=swarm_id,
            intent_ref=acceptance_id,
            actions=accepted_actions,
            status="accepted",
        )
        classification = classify_action_table(accepted_actions)
        self.repo.create_archetype_classification(
            action_table_ref=action_table_id,
            archetype_id=classification["archetype_id"],
            confidence=classification["confidence"],
            classification_state=classification["classification_state"],
            matched_capabilities=classification["matched_capabilities"],
            dependency_structure=classification["dependency_structure"],
        )

        self.repo.update_swarm(swarm_id, accepted_intent_id=acceptance_id)
        self._emit("intent_accepted", swarm_id, acceptance_id, accepted_by)
        return acceptance_id

    def evaluate_pre_acceptance(
        self,
        swarm_id: str,
        restatement_id: str,
        actor_id: str,
    ) -> dict:
        """Evaluate governance warnings before intent acceptance."""
        restatement = self.repo.get_restatement(restatement_id)
        if not restatement:
            raise ValueError(f"Restatement not found: {restatement_id}")

        raw_steps = restatement.get("structured_steps_json")
        raw_constraints = restatement.get("inferred_constraints_json")
        steps = json.loads(raw_steps) if raw_steps else []
        constraints = json.loads(raw_constraints) if raw_constraints else {}
        acceptance_tests = constraints.get("acceptance_tests", [])

        warnings = evaluate_semantic_ambiguity(
            steps=steps,
            acceptance_tests=acceptance_tests,
            constraints=constraints,
            trigger_stage="acceptance_review",
            actor_id=actor_id,
            swarm_id=swarm_id,
            affected_artifact_refs=[restatement_id],
        )
        for warning in warnings:
            warning["swarm_id"] = swarm_id

        summary = summarize_warnings(warnings)
        return {
            "governance_warnings": warnings,
            "assurance_posture": summary["assurance_posture"],
            "can_proceed": summary["can_proceed"],
        }

    def get_clarification_state(self, swarm_id: str) -> dict:
        """Get the current state of intent clarification for a swarm."""
        swarm = self.repo.get_swarm(swarm_id)
        if not swarm:
            raise ValueError(f"Swarm not found: {swarm_id}")

        drafts = self.repo.conn.execute(
            "SELECT draft_id, status FROM intent_drafts "
            "WHERE swarm_id = ? ORDER BY created_at DESC LIMIT 1",
            (swarm_id,),
        ).fetchone()

        has_draft = drafts is not None
        draft_id = drafts["draft_id"] if drafts else None

        extraction_state = None
        if draft_id:
            extraction_state = self._build_current_extraction_state(
                swarm_id, draft_id
            )

        has_restatement = False
        restatement_id = None
        if draft_id:
            restatement = self.repo.conn.execute(
                "SELECT restatement_id, status FROM intent_restatements "
                "WHERE draft_id = ? ORDER BY generated_at DESC LIMIT 1",
                (draft_id,),
            ).fetchone()
            if restatement:
                has_restatement = True
                restatement_id = restatement["restatement_id"]

        has_acceptance = swarm.get("accepted_intent_id") is not None

        if has_acceptance:
            phase = "accepted"
        elif has_restatement:
            phase = "awaiting_acceptance"
        elif has_draft:
            if extraction_state and extraction_state["unresolved_issues"]:
                phase = "needs_clarification"
            elif extraction_state and extraction_state["actions"]:
                phase = "ready_for_restatement"
            else:
                phase = "awaiting_restatement"
        else:
            phase = "no_intent"

        return {
            "swarm_id": swarm_id,
            "has_draft": has_draft,
            "has_restatement": has_restatement,
            "has_acceptance": has_acceptance,
            "current_phase": phase,
            "draft_id": draft_id,
            "restatement_id": restatement_id,
            "clarification_history": (
                self.repo.list_intent_clarifications(
                    swarm_id=swarm_id, draft_id=draft_id
                ) if draft_id else []
            ),
            "extraction_state": extraction_state,
        }
