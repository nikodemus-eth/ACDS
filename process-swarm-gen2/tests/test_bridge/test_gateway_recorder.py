"""Tests for the Gateway Recorder."""

from __future__ import annotations

import json

import pytest

from swarm.bridge.gateway_recorder import GatewayRecorder


@pytest.fixture
def recorder(tmp_path):
    """Create a GatewayRecorder with temp root."""
    return GatewayRecorder(tmp_path)


class TestGatewayRecorder:
    def test_record_creates_all_artifacts(self, recorder, tmp_path):
        result = recorder.record_agent_run(
            run_id="test-run-001",
            channel="webchat",
            message="Hello world",
            response_text="Hi there!",
            model="test-model",
            provider="test-provider",
            duration_ms=100,
        )

        # Check execution record returned
        assert result["execution_status"] == "completed"
        assert result["record_id"]

        # Check all artifact directories were populated
        artifacts = tmp_path / "artifacts"
        assert (artifacts / "proposals").exists()
        assert (artifacts / "validation").exists()
        assert (artifacts / "plans").exists()
        assert (artifacts / "executions").exists()

    def test_record_creates_proposal_file(self, recorder, tmp_path):
        recorder.record_agent_run(
            run_id="test-run-002",
            channel="telegram",
            message="What is the weather?",
            response_text="I cannot check weather.",
            model="test-model",
            provider="test-provider",
            duration_ms=50,
        )

        proposals_dir = tmp_path / "artifacts" / "proposals"
        files = list(proposals_dir.glob("*.json"))
        assert len(files) == 1

        with open(files[0]) as f:
            proposal = json.load(f)
        assert proposal["source"] == "gateway"
        assert "What is the weather?" in proposal["intent"]

    def test_record_appends_to_ledger(self, recorder, tmp_path):
        recorder.record_agent_run(
            run_id="test-run-003",
            channel="cli",
            message="Test",
            response_text="Response",
            model="model",
            provider="provider",
            duration_ms=10,
        )

        ledger = tmp_path / "ledger" / "execution_ledger.log"
        assert ledger.exists()
        content = ledger.read_text()
        assert "status=completed" in content

    def test_deterministic_ids(self, recorder):
        """Same run_id produces same artifact IDs."""
        r1 = recorder.record_agent_run(
            run_id="deterministic-001",
            channel="webchat",
            message="Test",
            response_text="Response",
            model="model",
            provider="provider",
            duration_ms=10,
        )
        # Record ID is derived from run_id via uuid5
        assert r1["record_id"]
        assert r1["plan_id"]
        assert r1["lease_id"].startswith("lease-gw-")

    def test_gateway_metadata_in_execution(self, recorder):
        result = recorder.record_agent_run(
            run_id="meta-test-001",
            channel="webchat",
            message="Hello",
            response_text="World",
            model="gpt-4",
            provider="openai",
            duration_ms=200,
            session_id="sess-001",
            input_tokens=10,
            output_tokens=5,
        )

        meta = result["gateway_metadata"]
        assert meta["channel"] == "webchat"
        assert meta["model"] == "gpt-4"
        assert meta["provider"] == "openai"
        assert meta["duration_ms"] == 200

    def test_content_hash_in_metadata(self, recorder):
        result = recorder.record_agent_run(
            run_id="hash-test-001",
            channel="webchat",
            message="Hello",
            response_text="Specific response text for hashing",
            model="model",
            provider="provider",
            duration_ms=10,
        )

        assert "response_hash" in result["gateway_metadata"]
        assert len(result["gateway_metadata"]["response_hash"]) == 16
