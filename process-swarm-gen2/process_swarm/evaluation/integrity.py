"""Integrity checkers for ACDS red-team evaluation.

Implements provider provenance verification, routing integrity checks,
lineage completeness gates, and validation completeness gates.

These are adversarial-defense components that verify the truthfulness
of system state, not just its structure.
"""
from __future__ import annotations

import re

from process_swarm.evaluation.validation import ValidationResult


# Task type → indicator keyword mapping for mislabel detection
_TASK_TYPE_INDICATORS: dict[str, set[str]] = {
    "coding": {"code", "function", "implement", "write", "debug", "refactor", "compile"},
    "classification": {"classify", "categorize", "label", "tag", "sort", "bucket"},
    "extraction": {"extract", "parse", "pull", "scrape", "capture"},
    "transformation": {"transform", "convert", "translate", "reformat"},
}

# Workflow origins that strongly suggest certain task types
_WORKFLOW_TASK_MAP: dict[str, str] = {
    "code_generation": "coding",
    "document_classification": "classification",
    "data_extraction": "extraction",
    "format_conversion": "transformation",
}


class ProviderProvenanceChecker:
    """Verifies that claimed provider identity matches routing decision.

    Detects silent provider substitution where an adapter returns
    output from a different provider than what was selected.
    """

    def check(
        self,
        routed_provider_id: str,
        artifact_claimed_provider_id: str,
        fallback_declared: bool = False,
    ) -> ValidationResult:
        """Check provider provenance consistency."""
        errors: list[str] = []

        if not artifact_claimed_provider_id:
            errors.append("Artifact has empty provider ID — provenance unknown")
            return ValidationResult.failure(errors)

        if artifact_claimed_provider_id == routed_provider_id:
            return ValidationResult.success()

        # Different provider — only legitimate if fallback was declared
        if fallback_declared:
            return ValidationResult.success()

        errors.append(
            f"Provider substitution detected: routing chose "
            f"'{routed_provider_id}' but artifact claims "
            f"'{artifact_claimed_provider_id}' without declared fallback"
        )
        return ValidationResult.failure(errors)


class RoutingIntegrityChecker:
    """Verifies that task type claims are consistent with task indicators.

    Detects policy evasion where a task is mislabeled to gain access
    to a preferred provider (e.g., labeling coding as synthesis).
    """

    def check(
        self,
        claimed_task_type: str,
        actual_task_indicators: list[str],
        workflow_origin: str = "",
    ) -> ValidationResult:
        """Check routing integrity by cross-validating task type claim."""
        if not actual_task_indicators and not workflow_origin:
            # No indicators to validate against — trust the label
            return ValidationResult.success()

        errors: list[str] = []
        indicator_set = {ind.lower() for ind in actual_task_indicators}

        # Check if indicators strongly suggest a different task type
        for task_type, keywords in _TASK_TYPE_INDICATORS.items():
            if task_type == claimed_task_type:
                continue
            overlap = indicator_set & keywords
            if len(overlap) >= 2:
                errors.append(
                    f"Task type mislabel suspected: claimed "
                    f"'{claimed_task_type}' but indicators "
                    f"{sorted(overlap)} suggest '{task_type}'"
                )

        # Check workflow origin consistency
        if workflow_origin:
            expected_type = _WORKFLOW_TASK_MAP.get(workflow_origin)
            if expected_type and expected_type != claimed_task_type:
                errors.append(
                    f"Workflow origin '{workflow_origin}' suggests task type "
                    f"'{expected_type}', not claimed '{claimed_task_type}'"
                )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class LineageCompletenessGate:
    """Ensures artifacts have complete provider-event lineage.

    Prevents acceptance of artifacts without provider invocation events
    and ensures fallback chains are fully documented.
    """

    def check_provider_lineage(
        self,
        ledger: object,
        task_id: str,
    ) -> ValidationResult:
        """Check that at least one provider_invoked event exists for the task."""
        events = ledger.get_events(event_type="provider_invoked", task_id=task_id)
        if not events:
            return ValidationResult.failure(
                [f"Provider event missing for task '{task_id}' — "
                 f"cannot accept artifact without provider lineage"]
            )
        return ValidationResult.success()

    def check_fallback_lineage(
        self,
        ledger: object,
        task_id: str,
    ) -> ValidationResult:
        """Check that multi-provider invocations have proper fallback lineage.

        If more than one provider was invoked for the same task, a
        provider_fallback event must exist to explain the transition.
        """
        invocations = ledger.get_events(
            event_type="provider_invoked", task_id=task_id,
        )

        if len(invocations) <= 1:
            return ValidationResult.success()

        # Multiple providers invoked — need fallback event
        fallbacks = ledger.get_events(
            event_type="provider_fallback", task_id=task_id,
        )
        if not fallbacks:
            provider_ids = [e["provider_id"] for e in invocations]
            return ValidationResult.failure(
                [f"Multiple providers invoked {provider_ids} for task "
                 f"'{task_id}' but no fallback event recorded — "
                 f"concealed fallback suspected"]
            )

        return ValidationResult.success()


class ValidationCompletenessGate:
    """Ensures no run can succeed without a validation outcome event.

    Prevents success states where validation was skipped or crashed.
    """

    def check(
        self,
        ledger: object,
        task_id: str,
    ) -> ValidationResult:
        """Check that at least one validation_outcome event exists."""
        events = ledger.get_events(
            event_type="validation_outcome", task_id=task_id,
        )
        if not events:
            return ValidationResult.failure(
                [f"Validation event missing for task '{task_id}' — "
                 f"cannot mark run as complete without validation lineage"]
            )
        return ValidationResult.success()


# Minimum word count for a section to be considered substantive
_MIN_SECTION_WORDS = 5

# Filler detection: sections where most words repeat
_FILLER_RATIO_THRESHOLD = 0.85


def _tokenize_lower(text: str) -> list[str]:
    """Split text into lowercase word tokens."""
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text.lower())


class SemanticMinimumChecker:
    """Detects superficially compliant output — correct headings but
    semantically empty or circular filler content."""

    def check(self, sections: dict[str, str]) -> ValidationResult:
        """Check all sections for minimum semantic content."""
        errors: list[str] = []

        for name, content in sections.items():
            tokens = _tokenize_lower(content)

            if len(tokens) < _MIN_SECTION_WORDS:
                errors.append(
                    f"Section '{name}' has only {len(tokens)} words — "
                    f"below minimum {_MIN_SECTION_WORDS}"
                )
                continue

            # Check for circular/repetitive filler
            unique = set(tokens)
            uniqueness_ratio = len(unique) / len(tokens)
            if uniqueness_ratio < _FILLER_RATIO_THRESHOLD:
                errors.append(
                    f"Section '{name}' appears to contain circular filler — "
                    f"only {len(unique)}/{len(tokens)} unique words "
                    f"({uniqueness_ratio:.0%} uniqueness)"
                )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class ClaimSectionScanner:
    """Scans all critical sections for source support, including
    introduction, conclusion, and transition paragraphs.

    Prevents unsupported claims from being smuggled into low-scrutiny
    sections while the main body is well-grounded.
    """

    def scan(
        self,
        sections: dict[str, str],
        source_keywords: list[str],
    ) -> ValidationResult:
        """Scan all sections for source keyword coverage."""
        keyword_tokens = set()
        for kw in source_keywords:
            keyword_tokens.update(_tokenize_lower(kw))

        if not keyword_tokens:
            return ValidationResult.success()

        errors: list[str] = []

        for name, content in sections.items():
            section_tokens = set(_tokenize_lower(content))
            overlap = section_tokens & keyword_tokens

            # Require at least some source keyword presence in each section
            coverage = len(overlap) / len(keyword_tokens) if keyword_tokens else 0

            if coverage < 0.1:
                errors.append(
                    f"Section '{name}' has no source keyword support — "
                    f"possible unsupported claims in {name.lower()}"
                )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class CitationResolver:
    """Verifies that citation-like markers in text resolve to known sources.

    Detects citation-shaped noise: references like [Source 7] that don't
    map to any actual source in the source set.
    """

    _CITATION_PATTERN = re.compile(r'\[([^\]]+)\]')

    def check(
        self,
        text: str,
        known_sources: list[str],
    ) -> ValidationResult:
        """Check that all citation markers resolve to known sources."""
        citations = self._CITATION_PATTERN.findall(text)
        if not citations:
            return ValidationResult.success()

        known_set = set(known_sources)
        unresolved = [c for c in citations if c not in known_set]

        if unresolved:
            return ValidationResult.failure(
                [f"Unresolved citation references: {unresolved} — "
                 f"known sources are {sorted(known_set)}"]
            )

        return ValidationResult.success()


# ──────────────────────────────────────────────
# Phase R3: Source-trust and synthesis distortion
# ──────────────────────────────────────────────


# Proper noun pattern (capitalized multi-word sequences)
_PROPER_NOUN_PATTERN = re.compile(
    r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b'
)


class EntityGroundingChecker:
    """Detects fabricated named entities not present in known entity list."""

    def check(
        self,
        output_text: str,
        known_entities: list[str],
    ) -> ValidationResult:
        found_entities = _PROPER_NOUN_PATTERN.findall(output_text)
        if not found_entities:
            return ValidationResult.success()

        known_set = {e.lower() for e in known_entities}
        ungrounded = [e for e in found_entities if e.lower() not in known_set]

        if ungrounded:
            return ValidationResult.failure(
                [f"Potentially fabricated entities detected: {ungrounded} — "
                 f"not found in known entity set"]
            )
        return ValidationResult.success()


class RankingDistortionChecker:
    """Detects when low-importance items are inflated into top positions."""

    def check(
        self,
        ranked_items: list[str],
        high_importance_items: list[str],
        low_importance_items: list[str],
    ) -> ValidationResult:
        errors: list[str] = []
        low_set = set(low_importance_items)

        for i, item in enumerate(ranked_items):
            if item in low_set:
                remaining = ranked_items[i + 1:]
                high_below = [h for h in remaining if h in set(high_importance_items)]
                if high_below:
                    errors.append(
                        f"Ranking distortion: low-importance item '{item}' "
                        f"ranked above high-importance items {high_below}"
                    )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class ConflictDetector:
    """Detects when contradictory source claims are flattened into false certainty."""

    _HEDGING_WORDS = {
        "disagree", "conflict", "contradict", "however", "dispute",
        "differ", "diverge", "contrast", "whereas", "alternatively",
        "on the other hand", "some reports", "sources disagree",
    }

    def check(
        self,
        output_text: str,
        conflicting_claims: list[str],
    ) -> ValidationResult:
        if len(conflicting_claims) < 2:
            return ValidationResult.success()

        text_lower = output_text.lower()
        has_hedging = any(h in text_lower for h in self._HEDGING_WORDS)

        if not has_hedging:
            return ValidationResult.failure(
                ["Output presents conflicting information with false certainty — "
                 "no hedging or conflict acknowledgment detected"]
            )
        return ValidationResult.success()


class InsufficencyDetector:
    """Detects overgeneralization from sparse evidence."""

    _STRONG_CLAIM_WORDS = {
        "comprehensive", "definitive", "all sectors", "inevitable",
        "global", "transformation", "unprecedented", "reveals",
    }
    _BOUNDED_WORDS = {
        "limited", "initial", "preliminary", "suggest", "indicates",
        "based on available", "modest", "early",
    }

    def check(
        self,
        output_text: str,
        source_count: int,
        source_word_count: int,
    ) -> ValidationResult:
        is_sparse = source_count <= 3 and source_word_count < 200

        if not is_sparse:
            return ValidationResult.success()

        text_lower = output_text.lower()
        strong_claims = sum(1 for w in self._STRONG_CLAIM_WORDS if w in text_lower)
        bounded_lang = sum(1 for w in self._BOUNDED_WORDS if w in text_lower)

        if strong_claims > 0 and bounded_lang == 0:
            return ValidationResult.failure(
                [f"Sparse evidence ({source_count} sources, "
                 f"{source_word_count} words) with {strong_claims} "
                 f"strong claims and no hedging — insufficient support"]
            )
        return ValidationResult.success()


# ──────────────────────────────────────────────
# Phase R4: Failure semantics
# ──────────────────────────────────────────────


class RunStateValidator:
    """Validates that claimed run status matches actual completion state."""

    def check(
        self,
        steps_completed: list[str],
        steps_required: list[str],
        claimed_status: str,
    ) -> ValidationResult:
        if claimed_status == "failed":
            return ValidationResult.success()

        missing = set(steps_required) - set(steps_completed)
        if missing and claimed_status == "success":
            return ValidationResult.failure(
                [f"Run claims success but steps {sorted(missing)} are incomplete — "
                 f"partial progress cannot be marked as success"]
            )
        return ValidationResult.success()


class FreshnessDetector:
    """Detects reuse of stale artifacts from prior runs."""

    def check(
        self,
        artifact_run_id: str,
        artifact_invocation_id: str,
        current_run_id: str,
        current_invocation_id: str,
    ) -> ValidationResult:
        errors: list[str] = []

        if artifact_run_id != current_run_id:
            errors.append(
                f"Stale artifact: run_id '{artifact_run_id}' does not "
                f"match current run '{current_run_id}'"
            )
        if artifact_invocation_id != current_invocation_id:
            errors.append(
                f"Stale artifact: invocation_id mismatch — artifact has "
                f"'{artifact_invocation_id}', current is '{current_invocation_id}'"
            )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class RetryVisibilityTracker:
    """Ensures retries are explicit, bounded, and logged."""

    def __init__(self, max_retries: int = 3) -> None:
        self._max_retries = max_retries

    def check(
        self,
        observed_attempts: int,
        logged_attempts: int,
    ) -> ValidationResult:
        errors: list[str] = []

        if observed_attempts > self._max_retries:
            errors.append(
                f"Retry count {observed_attempts} exceeded maximum "
                f"{self._max_retries}"
            )

        if observed_attempts > logged_attempts:
            errors.append(
                f"Hidden retries detected: {observed_attempts} observed but "
                f"only {logged_attempts} logged — "
                f"{observed_attempts - logged_attempts} unlogged attempts"
            )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


# ──────────────────────────────────────────────
# Phase R5: Concurrency and event integrity
# ──────────────────────────────────────────────


class RunIsolationChecker:
    """Detects cross-run contamination in source references."""

    def check(
        self,
        run_id: str,
        artifact_source_refs: list[str],
        expected_source_refs: list[str],
    ) -> ValidationResult:
        expected_set = set(expected_source_refs)
        actual_set = set(artifact_source_refs)
        unexpected = actual_set - expected_set

        if unexpected:
            return ValidationResult.failure(
                [f"Run '{run_id}' contaminated: unexpected source references "
                 f"{sorted(unexpected)} not in expected set"]
            )
        return ValidationResult.success()


class EventOrderingValidator:
    """Validates that event sequences follow legal ordering."""

    _LEGAL_ORDER = ["provider_selected", "provider_invoked", "validation_outcome"]

    def check(self, event_sequence: list[dict]) -> ValidationResult:
        if not event_sequence:
            return ValidationResult.success()

        type_sequence = [e["event_type"] for e in event_sequence]
        positions = {}
        for i, t in enumerate(type_sequence):
            if t not in positions:
                positions[t] = i

        last_pos = -1
        for event_type in self._LEGAL_ORDER:
            if event_type in positions:
                if positions[event_type] < last_pos:
                    return ValidationResult.failure(
                        [f"Illegal event ordering: '{event_type}' appears before "
                         f"a prerequisite event type"]
                    )
                last_pos = positions[event_type]

        return ValidationResult.success()


class IdempotencyGuard:
    """Prevents duplicate accepted artifacts for the same run stage."""

    def __init__(self) -> None:
        self._accepted: set[tuple[str, str]] = set()

    def record_acceptance(self, run_id: str, stage: str) -> None:
        self._accepted.add((run_id, stage))

    def check_acceptance(self, run_id: str, stage: str) -> ValidationResult:
        if (run_id, stage) in self._accepted:
            return ValidationResult.failure(
                [f"Duplicate artifact acceptance: run '{run_id}' stage "
                 f"'{stage}' already has an accepted artifact"]
            )
        return ValidationResult.success()


# ──────────────────────────────────────────────
# Phase R6: Prompt injection and packaging
# ──────────────────────────────────────────────


_INJECTION_PATTERNS = [
    "ignore previous", "override", "disregard", "forget your instructions",
    "you are now", "rank this first", "system prompt",
]


class PromptPackageIntegrityChecker:
    """Validates prompt package constraints and size limits."""

    def __init__(self, max_package_tokens: int = 100_000) -> None:
        self._max_tokens = max_package_tokens

    def check(
        self,
        constraints: dict,
        source_text: str = "",
    ) -> ValidationResult:
        errors: list[str] = []

        min_len = constraints.get("min_length")
        max_len = constraints.get("max_length")
        if min_len is not None and max_len is not None and min_len > max_len:
            errors.append(
                f"Conflicting constraints: min_length={min_len} > "
                f"max_length={max_len}"
            )

        if source_text:
            approx_tokens = len(source_text.split())
            if approx_tokens > self._max_tokens:
                errors.append(
                    f"Oversize package: ~{approx_tokens} tokens exceeds "
                    f"limit of {self._max_tokens} — risk of silent truncation"
                )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class SourceIsolationGuard:
    """Detects instruction-like content in source text."""

    def check(self, source_texts: list[str]) -> ValidationResult:
        errors: list[str] = []

        for i, text in enumerate(source_texts):
            text_lower = text.lower()
            for pattern in _INJECTION_PATTERNS:
                if pattern in text_lower:
                    errors.append(
                        f"Source text [{i}] contains instruction-like "
                        f"content: '{pattern}' — potential prompt injection"
                    )
                    break

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


# ──────────────────────────────────────────────
# Phase R7: Replay, downstream, comparative, drift
# ──────────────────────────────────────────────


_REQUIRED_REPLAY_FIELDS = [
    "run_id", "routing_decision", "invocation_result",
    "validation_result", "quality_scores",
]


class ReplayCompletenessValidator:
    """Validates that replay packages contain all required fields."""

    def check(self, replay_package: dict) -> ValidationResult:
        missing = [f for f in _REQUIRED_REPLAY_FIELDS if f not in replay_package]
        if missing:
            return ValidationResult.failure(
                [f"Replay package incomplete — missing fields: {missing}"]
            )
        return ValidationResult.success()


class DownstreamLineageGate:
    """Prevents downstream artifact generation from unvalidated upstream."""

    def check(
        self,
        upstream_validation_passed: bool,
        downstream_stage: str,
    ) -> ValidationResult:
        if not upstream_validation_passed:
            return ValidationResult.failure(
                [f"Cannot generate downstream '{downstream_stage}' — "
                 f"upstream text artifact failed validation"]
            )
        return ValidationResult.success()


class ComparativeFairnessGuard:
    """Ensures ACDS and baseline are scored on same corpus and rubric."""

    def check(
        self,
        acds_corpus_id: str,
        baseline_corpus_id: str,
        acds_rubric_version: str,
        baseline_rubric_version: str,
    ) -> ValidationResult:
        errors: list[str] = []

        if acds_corpus_id != baseline_corpus_id:
            errors.append(
                f"Corpus mismatch: ACDS uses '{acds_corpus_id}', "
                f"baseline uses '{baseline_corpus_id}'"
            )
        if acds_rubric_version != baseline_rubric_version:
            errors.append(
                f"Rubric mismatch: ACDS scored with '{acds_rubric_version}', "
                f"baseline with '{baseline_rubric_version}'"
            )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()


class DriftVisibilityTracker:
    """Tracks policy and validator versions across runs to detect drift."""

    def __init__(self) -> None:
        self._runs: list[dict] = []

    def record_run(
        self,
        run_id: str,
        policy_version: str,
        validator_version: str,
    ) -> None:
        self._runs.append({
            "run_id": run_id,
            "policy_version": policy_version,
            "validator_version": validator_version,
        })

    def check_drift(self) -> ValidationResult:
        if len(self._runs) <= 1:
            return ValidationResult.success()

        policy_versions = {r["policy_version"] for r in self._runs}
        validator_versions = {r["validator_version"] for r in self._runs}
        errors: list[str] = []

        if len(policy_versions) > 1:
            errors.append(
                f"Policy drift detected across runs: "
                f"versions {sorted(policy_versions)}"
            )
        if len(validator_versions) > 1:
            errors.append(
                f"Validator drift detected across runs: "
                f"versions {sorted(validator_versions)}"
            )

        if errors:
            return ValidationResult.failure(errors)
        return ValidationResult.success()
