"""Tests for BranchEvaluator."""
from __future__ import annotations

import pytest

from swarm.adaptive.branch_evaluator import BranchEvaluator, BranchScore
from swarm.adaptive.improvement_ledger import BranchId


@pytest.fixture
def evaluator():
    return BranchEvaluator()


class TestBranchEvaluator:
    def test_written_branch_full_score(self, evaluator):
        results = {
            "source_count": 8,
            "section_count": 4,
            "total_sections": 4,
            "word_count": 800,
            "citation_count": 8,
        }
        score = evaluator.evaluate(BranchId.BRIEFING_SYNTHESIS.value, results)
        assert score.score >= 0.95

    def test_written_branch_partial_score(self, evaluator):
        results = {
            "source_count": 3,
            "section_count": 2,
            "total_sections": 4,
            "word_count": 200,
            "citation_count": 1,
        }
        score = evaluator.evaluate(BranchId.BRIEFING_SYNTHESIS.value, results)
        assert 0.1 < score.score < 0.8

    def test_written_branch_empty_results(self, evaluator):
        score = evaluator.evaluate(BranchId.BRIEFING_SYNTHESIS.value, {})
        assert score.score == 0.0

    def test_word_count_out_of_range(self, evaluator):
        results = {
            "source_count": 6,
            "section_count": 4,
            "total_sections": 4,
            "word_count": 100,
            "citation_count": 6,
        }
        score = evaluator.evaluate(BranchId.BRIEFING_SYNTHESIS.value, results)
        assert score.components["word_count_compliance"] < 0.5

    def test_tts_branch_no_audio(self, evaluator):
        score = evaluator.evaluate(BranchId.TTS_GENERATION.value, {})
        assert score.score < 0.3

    def test_tts_branch_valid_audio(self, evaluator):
        results = {
            "audio_path": "/tmp/audio.mp3",
            "chunks_rendered": 10,
            "chunks_total": 10,
            "normalized_char_count": 1000,
            "audio_hash": "abc123",
        }
        score = evaluator.evaluate(BranchId.TTS_GENERATION.value, results)
        assert score.score >= 0.8

    def test_tts_branch_partial_chunks(self, evaluator):
        results = {
            "audio_path": "/tmp/audio.mp3",
            "chunks_rendered": 5,
            "chunks_total": 10,
            "normalized_char_count": 500,
            "audio_hash": "abc",
        }
        score = evaluator.evaluate(BranchId.TTS_GENERATION.value, results)
        assert score.components["chunk_success_rate"] == 0.5

    def test_speech_script_with_stats(self, evaluator):
        results = {
            "script_path": "/tmp/script.txt",
            "transform_stats": {
                "avg_words_per_sentence": 15,
                "contractions_applied": 5,
                "transitions_applied": 3,
            },
        }
        score = evaluator.evaluate(BranchId.SPEECH_SCRIPT_PREP.value, results)
        assert score.score > 0.5

    def test_speech_script_no_data(self, evaluator):
        score = evaluator.evaluate(BranchId.SPEECH_SCRIPT_PREP.value, {})
        assert score.score == 0.0

    def test_source_intake(self, evaluator):
        results = {"kept_count": 9}
        score = evaluator.evaluate(BranchId.SOURCE_INTAKE.value, results)
        assert score.score == 1.0

    def test_validation_passed(self, evaluator):
        results = {"valid": True}
        score = evaluator.evaluate(BranchId.ARTIFACT_VALIDATION.value, results)
        assert score.score == 1.0

    def test_validation_failed(self, evaluator):
        results = {"valid": False}
        score = evaluator.evaluate(BranchId.ARTIFACT_VALIDATION.value, results)
        assert score.score == 0.0

    def test_validation_empty_violations(self, evaluator):
        results = {"violations": []}
        score = evaluator.evaluate(BranchId.ARTIFACT_VALIDATION.value, results)
        assert score.score == 1.0

    def test_dispatch_by_branch_id(self, evaluator):
        for bid in BranchId:
            score = evaluator.evaluate(bid.value, {})
            assert isinstance(score, BranchScore)

    def test_unknown_branch_returns_default(self, evaluator):
        score = evaluator.evaluate("unknown_branch", {})
        assert score.score == 0.5
