"""Action extraction from raw intent text.

Splits raw text into clauses and extracts verb-object action tuples
with dependency detection and issue flagging.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ActionTuple:
    step: int
    verb: Optional[str]
    object: Optional[str]
    destination: Optional[str] = None
    qualifiers: list[str] = field(default_factory=list)
    dependencies: list[int] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)
    source_text: str = ""
    source_reference: Optional[str] = None


@dataclass
class UnresolvedIssue:
    issue_type: str
    message: str
    action_index: Optional[int] = None
    question_text: str = ""


AMBIGUOUS_VERBS = frozenset({"process", "prepare", "handle", "fix", "update"})
REFERENCE_TOKENS = frozenset({"it", "that", "those", "there", "them"})
KNOWN_VERBS = frozenset({
    "run", "post", "send", "generate", "create", "write",
    "delete", "email", "notify", "deliver", "collect", "build",
    "validate", "test", "transform", "filter", "format",
    "compile", "package", "deploy", "configure", "monitor",
})

_DELIVERY_VERBS = frozenset({"email", "send", "deliver", "notify"})


def extract_action_tuples(raw_text: str) -> dict:
    """Extract action tuples from raw intent text.

    Returns dict with keys: actions, unresolved_issues, dependency_graph, can_proceed
    """
    clauses = _split_clauses(raw_text)
    actions = []
    issues = []

    for i, clause in enumerate(clauses):
        verb, obj = _extract_verb_and_object(clause)
        dest = _detect_destination(clause)
        qualifiers = []
        if verb and verb in _DELIVERY_VERBS:
            qualifiers.append("delivery")

        action = ActionTuple(
            step=i + 1,
            verb=verb,
            object=obj,
            destination=dest,
            qualifiers=qualifiers,
            dependencies=[i] if i > 0 else [],
            source_text=clause.strip(),
        )
        actions.append(action)
        issues.extend(_detect_issue_for_clause(verb, obj, i))

    # Build dependency graph
    dep_graph = {}
    for a in actions:
        dep_graph[a.step] = a.dependencies

    can_proceed = not any(
        issue.issue_type in ("missing_verb", "missing_object")
        for issue in issues
    )

    return {
        "actions": [_action_to_dict(a) for a in actions],
        "unresolved_issues": [_issue_to_dict(i) for i in issues],
        "dependency_graph": dep_graph,
        "can_proceed": can_proceed,
    }


def _split_clauses(raw_text: str) -> list[str]:
    parts = re.split(r",\s*|\bthen\b|\band then\b", raw_text, flags=re.IGNORECASE)
    return [p.strip() for p in parts if p.strip()]


def _extract_verb_and_object(clause: str) -> tuple[Optional[str], Optional[str]]:
    words = clause.strip().split()
    if not words:
        return None, None

    verb = words[0].lower().rstrip(".,;:")
    obj = " ".join(words[1:]).strip().rstrip(".,;:") if len(words) > 1 else None

    if verb not in KNOWN_VERBS and verb not in AMBIGUOUS_VERBS:
        # Try to find a known verb further in
        for i, w in enumerate(words[1:], 1):
            w_lower = w.lower().rstrip(".,;:")
            if w_lower in KNOWN_VERBS or w_lower in AMBIGUOUS_VERBS:
                verb = w_lower
                obj = " ".join(words[i + 1:]).strip().rstrip(".,;:") if i + 1 < len(words) else None
                break

    return verb if verb else None, obj if obj else None


def _detect_destination(text: str) -> Optional[str]:
    match = re.search(r"\bto\s+(\S+@\S+|\S+)", text, re.IGNORECASE)
    if match:
        return match.group(1)
    match = re.search(r"\binto\s+(\S+)", text, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


def _detect_issue_for_clause(
    verb: Optional[str], obj: Optional[str], action_index: int,
) -> list[UnresolvedIssue]:
    issues = []
    if not verb:
        issues.append(UnresolvedIssue(
            issue_type="missing_verb",
            message=f"Action {action_index + 1} has no identifiable verb",
            action_index=action_index,
            question_text="What action should be taken?",
        ))
    elif verb in AMBIGUOUS_VERBS:
        issues.append(UnresolvedIssue(
            issue_type="ambiguous_verb",
            message=f"Action {action_index + 1} uses ambiguous verb '{verb}'",
            action_index=action_index,
            question_text=f"What specifically do you mean by '{verb}'?",
        ))

    if not obj:
        issues.append(UnresolvedIssue(
            issue_type="missing_object",
            message=f"Action {action_index + 1} has no object",
            action_index=action_index,
            question_text="What should this action operate on?",
        ))
    elif obj:
        obj_lower = obj.lower()
        for token in REFERENCE_TOKENS:
            if re.search(rf"\b{token}\b", obj_lower):
                issues.append(UnresolvedIssue(
                    issue_type="unresolved_reference",
                    message=f"Action {action_index + 1} contains unresolved reference '{token}'",
                    action_index=action_index,
                    question_text=f"What does '{token}' refer to?",
                ))
                break

    return issues


def action_summary_from_tuples(actions: list[dict]) -> str:
    lines = []
    for a in actions:
        verb = a.get("verb", "?")
        obj = a.get("object", "?")
        lines.append(f"  {a['step']}. {verb} {obj}")
    return "\n".join(lines)


def _action_to_dict(a: ActionTuple) -> dict:
    return {
        "step": a.step,
        "verb": a.verb,
        "object": a.object,
        "destination": a.destination,
        "qualifiers": a.qualifiers,
        "dependencies": a.dependencies,
        "conditions": a.conditions,
        "source_text": a.source_text,
        "source_reference": a.source_reference,
    }


def _issue_to_dict(i: UnresolvedIssue) -> dict:
    return {
        "issue_type": i.issue_type,
        "message": i.message,
        "action_index": i.action_index,
        "question_text": i.question_text,
    }
