"""Tests for end-to-end pipeline runner."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from runtime.identity.signer import verify_attached_signature
from runtime.pipeline.runner import PipelineRunner


class TestPipelineRunner:
    def test_end_to_end_valid_proposal(self, openclaw_root, sample_proposal):
        # Write sample proposal to a file
        proposal_path = openclaw_root / "test_proposal.json"
        with open(proposal_path, "w") as f:
            json.dump(sample_proposal, f)

        runner = PipelineRunner(openclaw_root)
        record = runner.run(proposal_path)

        assert record["execution_status"] in ("completed", "partial")
        assert "record_id" in record
        assert verify_attached_signature(
            record,
            openclaw_root / "runtime" / "identity" / "keys",
        )

        # Verify artifacts were stored
        assert list((openclaw_root / "artifacts" / "proposals").glob("*.json"))
        assert list((openclaw_root / "artifacts" / "validation").glob("*.json"))
        assert list((openclaw_root / "artifacts" / "plans").glob("*.json"))
        assert list((openclaw_root / "artifacts" / "executions").glob("*.json"))

        # Verify ledger log was appended
        log = (openclaw_root / "ledger" / "execution_ledger.log").read_text()
        assert record["plan_id"] in log

    def test_invalid_proposal_raises(self, openclaw_root):
        # Write an invalid proposal
        bad_proposal = {"bad": "data"}
        proposal_path = openclaw_root / "bad_proposal.json"
        with open(proposal_path, "w") as f:
            json.dump(bad_proposal, f)

        runner = PipelineRunner(openclaw_root)
        with pytest.raises(ValueError):
            runner.run(proposal_path)

    def test_ingest_no_exports(self, openclaw_root):
        runner = PipelineRunner(openclaw_root)
        results = runner.ingest_from_m2()
        assert results == []
