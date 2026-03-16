"""Deterministic metric-based scoring for adaptive branches."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from swarm.adaptive.improvement_ledger import BranchId


@dataclass
class BranchScore:
    branch_id: str
    score: float
    components: dict[str, float] = field(default_factory=dict)
    artifacts_evaluated: list[str] = field(default_factory=list)


def _safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    if denominator == 0:
        return default
    return max(0.0, min(1.0, numerator / denominator))


def _find_value(results: dict, key: str) -> Any:
    """Search adapter_results for a key in any step."""
    if key in results:
        return results[key]
    for step_output in results.values():
        if isinstance(step_output, dict) and key in step_output:
            return step_output[key]
    return None


class BranchEvaluator:
    """Scores artifacts per-branch using deterministic metrics."""

    # Written branch weights
    W_SOURCE_COVERAGE = 0.25
    W_SECTION_COMPLETENESS = 0.25
    W_WORD_COUNT_COMPLIANCE = 0.25
    W_CITATION_COVERAGE = 0.25
    WORD_COUNT_MIN = 700
    WORD_COUNT_MAX = 900
    SOURCE_COUNT_MIN = 6

    # TTS branch weights
    W_AUDIO_EXISTS = 0.30
    W_CHUNK_SUCCESS = 0.30
    W_NORMALIZATION = 0.20
    W_FILE_INTEGRITY = 0.20

    _DISPATCH = {
        BranchId.SOURCE_INTAKE.value: "_evaluate_source_intake",
        BranchId.BRIEFING_SYNTHESIS.value: "_evaluate_written",
        BranchId.BRIEFING_REFINEMENT.value: "_evaluate_written",
        BranchId.SPEECH_SCRIPT_PREP.value: "_evaluate_speech_script",
        BranchId.TTS_GENERATION.value: "_evaluate_tts",
        BranchId.ARTIFACT_VALIDATION.value: "_evaluate_validation",
    }

    def evaluate(self, branch_id: str, adapter_results: dict) -> BranchScore:
        method_name = self._DISPATCH.get(branch_id, "_evaluate_default")
        method = getattr(self, method_name)
        return method(branch_id, adapter_results)

    def _evaluate_written(self, branch_id: str, results: dict) -> BranchScore:
        source_count = _find_value(results, "source_count") or 0
        section_count = _find_value(results, "section_count") or 0
        word_count = _find_value(results, "word_count") or 0
        citation_count = _find_value(results, "citation_count") or 0
        total_sections = _find_value(results, "total_sections") or 4

        source_cov = _safe_ratio(source_count, self.SOURCE_COUNT_MIN)
        section_comp = _safe_ratio(section_count, total_sections)

        if word_count == 0:
            wc_compliance = 0.0
        elif self.WORD_COUNT_MIN <= word_count <= self.WORD_COUNT_MAX:
            wc_compliance = 1.0
        else:
            mid = (self.WORD_COUNT_MIN + self.WORD_COUNT_MAX) / 2
            dist = abs(word_count - mid)
            span = (self.WORD_COUNT_MAX - self.WORD_COUNT_MIN) / 2
            wc_compliance = max(0.0, 1.0 - dist / (span * 3))

        cite_cov = _safe_ratio(citation_count, max(source_count, 1))

        score = (
            self.W_SOURCE_COVERAGE * source_cov
            + self.W_SECTION_COMPLETENESS * section_comp
            + self.W_WORD_COUNT_COMPLIANCE * wc_compliance
            + self.W_CITATION_COVERAGE * cite_cov
        )

        artifacts = []
        rp = _find_value(results, "report_path")
        if rp:
            artifacts.append(str(rp))

        return BranchScore(
            branch_id=branch_id,
            score=score,
            components={
                "source_coverage": source_cov,
                "section_completeness": section_comp,
                "word_count_compliance": wc_compliance,
                "citation_coverage": cite_cov,
            },
            artifacts_evaluated=artifacts,
        )

    def _evaluate_tts(self, branch_id: str, results: dict) -> BranchScore:
        audio_path = _find_value(results, "audio_path")
        audio_exists = 1.0 if audio_path else 0.0

        rendered = _find_value(results, "chunks_rendered") or 0
        total_chunks = _find_value(results, "chunks_total") or 0
        chunk_success = _safe_ratio(rendered, total_chunks)

        norm_chars = _find_value(results, "normalized_char_count") or 0
        normalization = min(1.0, norm_chars / 500) if norm_chars > 0 else 0.0

        has_hash = 1.0 if _find_value(results, "audio_hash") else 0.0

        score = (
            self.W_AUDIO_EXISTS * audio_exists
            + self.W_CHUNK_SUCCESS * chunk_success
            + self.W_NORMALIZATION * normalization
            + self.W_FILE_INTEGRITY * has_hash
        )

        artifacts = [str(audio_path)] if audio_path else []
        return BranchScore(
            branch_id=branch_id,
            score=score,
            components={
                "audio_exists": audio_exists,
                "chunk_success_rate": chunk_success,
                "normalization_quality": normalization,
                "file_integrity": has_hash,
            },
            artifacts_evaluated=artifacts,
        )

    def _evaluate_speech_script(self, branch_id: str, results: dict) -> BranchScore:
        stats = _find_value(results, "transform_stats") or {}
        script_exists = 1.0 if _find_value(results, "script_path") else 0.0

        avg_words = stats.get("avg_words_per_sentence", 0)
        readability = max(0.0, 1.0 - abs(avg_words - 15) / 15) if avg_words > 0 else 0.0

        contractions = 1.0 if stats.get("contractions_applied", 0) > 0 else 0.0
        transitions = 1.0 if stats.get("transitions_applied", 0) > 0 else 0.0
        speech_patterns = (contractions + transitions) / 2

        score = 0.4 * readability + 0.3 * speech_patterns + 0.3 * script_exists
        return BranchScore(
            branch_id=branch_id,
            score=score,
            components={
                "readability": readability,
                "speech_patterns": speech_patterns,
                "script_exists": script_exists,
            },
        )

    def _evaluate_source_intake(self, branch_id: str, results: dict) -> BranchScore:
        kept = _find_value(results, "kept_count") or 0
        score = _safe_ratio(kept, self.SOURCE_COUNT_MIN)
        return BranchScore(
            branch_id=branch_id,
            score=score,
            components={"kept_ratio": score},
        )

    def _evaluate_validation(self, branch_id: str, results: dict) -> BranchScore:
        valid = _find_value(results, "valid")
        violations = _find_value(results, "violations")

        if valid is True or (isinstance(violations, list) and len(violations) == 0):
            score = 1.0
        elif valid is False:
            score = 0.0
        else:
            score = 0.5

        return BranchScore(
            branch_id=branch_id,
            score=score,
            components={"validation_score": score},
        )

    def _evaluate_default(self, branch_id: str, results: dict) -> BranchScore:
        return BranchScore(branch_id=branch_id, score=0.5, components={"default": 0.5})
