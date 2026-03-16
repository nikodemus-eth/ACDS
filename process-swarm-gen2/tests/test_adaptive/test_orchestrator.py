"""Tests for AdaptiveOrchestrator."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from swarm.adaptive.improvement_ledger import BranchId, SchedulerDecision
from swarm.adaptive.orchestrator import (
    AdaptiveOrchestrator,
    AdaptiveResult,
    BranchConfig,
)


def _mock_runner(adapter_results_fn=None):
    runner = MagicMock()
    runner.events = MagicMock()

    def default_fn(run_id, swarm_id, actions):
        return {
            "execution_status": "succeeded",
            "adapter_results": {},
            "artifacts": [],
        }

    runner._execute_via_adapters = adapter_results_fn or default_fn
    return runner


def _high_score_results(**extra):
    """Results that produce ~1.0 score for written branch."""
    base = {
        "source_count": 8,
        "section_count": 4,
        "total_sections": 4,
        "word_count": 800,
        "citation_count": 8,
    }
    base.update(extra)
    return {
        "execution_status": "succeeded",
        "adapter_results": base,
        "artifacts": [],
    }


def _low_tts_results():
    return {
        "execution_status": "succeeded",
        "adapter_results": {},
        "artifacts": [],
    }


class TestAdaptiveOrchestrator:
    def test_single_cycle_all_converged(self):
        runner = _mock_runner(lambda *a: _high_score_results())
        orch = AdaptiveOrchestrator(runner, completion_target=0.75)
        configs = [
            BranchConfig(branch_id=BranchId.BRIEFING_SYNTHESIS.value, actions=[]),
        ]
        result = orch.run_adaptive("swarm-1", "run-1", configs)
        assert isinstance(result, AdaptiveResult)
        assert result.success
        assert result.total_cycles == 1

    def test_max_cycles_terminates(self):
        runner = _mock_runner(lambda *a: _low_tts_results())
        orch = AdaptiveOrchestrator(
            runner, max_cycles=3, completion_target=0.99
        )
        configs = [
            BranchConfig(branch_id=BranchId.TTS_GENERATION.value, actions=[]),
        ]
        result = orch.run_adaptive("swarm-1", "run-1", configs)
        assert result.total_cycles == 3

    def test_stagnation_triggers_reroute(self):
        call_count = [0]

        def mixed_results(run_id, swarm_id, actions):
            call_count[0] += 1
            return _low_tts_results()

        runner = _mock_runner(mixed_results)
        orch = AdaptiveOrchestrator(
            runner,
            max_cycles=5,
            stagnation_threshold=0.03,
            stagnation_consecutive=2,
            completion_target=0.99,
        )
        configs = [
            BranchConfig(branch_id=BranchId.TTS_GENERATION.value, actions=[]),
            BranchConfig(branch_id=BranchId.BRIEFING_SYNTHESIS.value, actions=[]),
        ]

        # Manually inject high scores for written branch so reroute triggers
        # We override the runner to return high results for written
        original_fn = runner._execute_via_adapters

        def smart_results(run_id, swarm_id, actions):
            # Check which branch is being evaluated via the ledger
            return _low_tts_results()

        runner._execute_via_adapters = smart_results
        result = orch.run_adaptive("swarm-1", "run-1", configs)

        # The TTS should eventually be deactivated
        tts_config = next(
            (c for c in configs if c.branch_id == BranchId.TTS_GENERATION.value),
            None,
        )
        assert tts_config is not None
        assert tts_config.active is False

    def test_branch_config_dataclass(self):
        bc = BranchConfig(branch_id="test", actions=[{"tool": "a"}])
        assert bc.active is True
        assert bc.branch_id == "test"

    def test_adaptive_result_ledger_dicts(self):
        result = AdaptiveResult(
            success=True,
            final_validation={"ledger": [{"branch_id": "a", "score": 0.5}]},
        )
        assert len(result.ledger_dicts) == 1

    def test_persist_validation(self, tmp_path):
        runner = _mock_runner(lambda *a: _high_score_results())
        orch = AdaptiveOrchestrator(runner, completion_target=0.75)
        configs = [
            BranchConfig(branch_id=BranchId.BRIEFING_SYNTHESIS.value, actions=[]),
        ]
        result = orch.run_adaptive(
            "swarm-1", "run-1", configs, workspace_root=tmp_path
        )
        assert (tmp_path / "output" / "adaptive_validation.json").exists()
