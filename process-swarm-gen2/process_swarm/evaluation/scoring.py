"""Quality scoring model for ACDS evaluation.

Implements deterministic, heuristic-based scoring across quality
dimensions.  Each dimension produces an ordinal 1-5 integer score.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


def _tokenize(text: str) -> set[str]:
    """Split text into lowercase word tokens."""
    return set(re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text.lower()))


def _overlap_ratio(tokens_a: set[str], tokens_b: set[str]) -> float:
    """Jaccard-like overlap: |intersection| / |union|, 0.0 if both empty."""
    if not tokens_a and not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


def _ratio_to_score(ratio: float) -> int:
    """Map a 0.0–1.0 ratio to a 1–5 ordinal score."""
    if ratio >= 0.6:
        return 5
    if ratio >= 0.4:
        return 4
    if ratio >= 0.25:
        return 3
    if ratio >= 0.1:
        return 2
    return 1


@dataclass
class ScoreResult:
    """Quality scores across all dimensions.

    Core dimensions (included in composite):
        accuracy, relevance, coherence, constraint_adherence, source_fidelity

    Optional dimension (excluded from composite by default):
        ranking_quality
    """
    accuracy: int
    relevance: int
    coherence: int
    constraint_adherence: int
    source_fidelity: int
    ranking_quality: int
    composite: float

    def to_dict(self) -> dict:
        return {
            "accuracy": self.accuracy,
            "relevance": self.relevance,
            "coherence": self.coherence,
            "constraint_adherence": self.constraint_adherence,
            "source_fidelity": self.source_fidelity,
            "ranking_quality": self.ranking_quality,
            "composite": self.composite,
        }


class QualityScorer:
    """Deterministic quality scorer for provider output.

    Uses token-overlap heuristics for accuracy, relevance, and source
    fidelity.  Uses structural heuristics for coherence.  Constraint
    adherence and ranking quality are passed as explicit signals.
    """

    def score(
        self,
        output_text: str,
        task_description: str,
        *,
        ground_truth: Optional[str] = None,
        source_keywords: Optional[list[str]] = None,
        constraints_met: Optional[bool] = None,
    ) -> ScoreResult:
        """Score provider output across all quality dimensions."""
        # Empty output → minimum scores
        if not output_text:
            return ScoreResult(
                accuracy=1, relevance=1, coherence=1,
                constraint_adherence=1, source_fidelity=1,
                ranking_quality=1, composite=1.0,
            )

        output_tokens = _tokenize(output_text)

        accuracy = self._score_accuracy(output_tokens, ground_truth)
        relevance = self._score_relevance(output_tokens, task_description)
        coherence = self._score_coherence(output_text)
        constraint_adherence = self._score_constraint_adherence(constraints_met)
        source_fidelity = self._score_source_fidelity(output_tokens, source_keywords)
        ranking_quality = self._score_ranking_quality(output_text)

        core = [accuracy, relevance, coherence, constraint_adherence, source_fidelity]
        composite = sum(core) / len(core)

        return ScoreResult(
            accuracy=accuracy,
            relevance=relevance,
            coherence=coherence,
            constraint_adherence=constraint_adherence,
            source_fidelity=source_fidelity,
            ranking_quality=ranking_quality,
            composite=composite,
        )

    def _score_accuracy(
        self, output_tokens: set[str], ground_truth: Optional[str],
    ) -> int:
        """Score accuracy against ground truth via token overlap."""
        if ground_truth is None:
            return 3  # neutral when no ground truth

        truth_tokens = _tokenize(ground_truth)
        if not truth_tokens:
            return 3

        # Check containment: if all truth tokens appear in output, score 5
        if truth_tokens <= output_tokens:
            return 5

        ratio = _overlap_ratio(output_tokens, truth_tokens)
        return _ratio_to_score(ratio)

    def _score_relevance(
        self, output_tokens: set[str], task_description: str,
    ) -> int:
        """Score relevance via task-keyword coverage in output.

        Uses coverage ratio (what fraction of task tokens appear in
        the output) rather than Jaccard, because a long relevant
        answer will naturally contain many tokens beyond the task
        description.
        """
        task_tokens = _tokenize(task_description)
        if not task_tokens:
            return 3

        found = len(task_tokens & output_tokens)
        coverage = found / len(task_tokens)

        if coverage >= 0.6:
            return 5
        if coverage >= 0.4:
            return 4
        if coverage >= 0.25:
            return 3
        if coverage >= 0.1:
            return 2
        return 1

    def _score_coherence(self, output_text: str) -> int:
        """Score coherence via structural heuristics.

        Heuristics:
        - Sentence count (more structured = more coherent)
        - Average sentence length (very short = fragmented)
        - Presence of connective words
        """
        sentences = [s.strip() for s in re.split(r'[.!?]+', output_text) if s.strip()]
        if not sentences:
            return 1

        avg_length = sum(len(s.split()) for s in sentences) / len(sentences)
        connectives = {"first", "second", "third", "however", "therefore",
                        "in conclusion", "furthermore", "additionally",
                        "moreover", "thus", "consequently"}
        text_lower = output_text.lower()
        connective_count = sum(1 for c in connectives if c in text_lower)

        score = 1
        if len(sentences) >= 2:
            score += 1
        if avg_length >= 4:
            score += 1
        if connective_count >= 1:
            score += 1
        if connective_count >= 2 and len(sentences) >= 3:
            score += 1

        return min(score, 5)

    def _score_constraint_adherence(self, constraints_met: Optional[bool]) -> int:
        """Score constraint adherence.  Binary: 5 if met, 1 if violated."""
        if constraints_met is None:
            return 3  # neutral when not specified
        return 5 if constraints_met else 1

    def _score_source_fidelity(
        self, output_tokens: set[str], source_keywords: Optional[list[str]],
    ) -> int:
        """Score source fidelity via keyword presence."""
        if source_keywords is None:
            return 3  # neutral when no source keywords

        if not source_keywords:
            return 3

        keyword_tokens = set()
        for kw in source_keywords:
            keyword_tokens.update(_tokenize(kw))

        if not keyword_tokens:
            return 3

        found = len(keyword_tokens & output_tokens)
        ratio = found / len(keyword_tokens)

        if ratio >= 0.75:
            return 5
        if ratio >= 0.5:
            return 4
        if ratio >= 0.25:
            return 3
        if ratio > 0:
            return 2
        return 1

    def _score_ranking_quality(self, output_text: str) -> int:
        """Score ranking quality.  Checks for numbered list structure."""
        numbered = re.findall(r'^\s*\d+[.)\]]\s', output_text, re.MULTILINE)
        if len(numbered) >= 3:
            return 4
        if len(numbered) >= 1:
            return 3
        return 2  # no ranking detected
