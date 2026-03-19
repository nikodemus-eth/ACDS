"""GRITS tests for lineage tracking.

Tests entry recording, chain building, save/load round-trip, and
process isolation. NO mocks, NO stubs, NO monkeypatches.
"""

from __future__ import annotations

import json
from pathlib import Path

from swarm.integration.lineage import LineageEntry, LineageTracker


class TestLineageEntry:
    """Entry records input/output hashes."""

    def test_entry_has_auto_generated_id(self):
        entry = LineageEntry()
        assert entry.entry_id
        assert len(entry.entry_id) == 12

    def test_entry_has_timestamp(self):
        entry = LineageEntry()
        assert entry.timestamp
        assert "T" in entry.timestamp

    def test_input_output_hashes_stored(self):
        h_in = LineageTracker.hash_data({"prompt": "test"})
        h_out = LineageTracker.hash_data({"text": "result"})
        entry = LineageEntry(input_hash=h_in, output_hash=h_out)
        assert entry.input_hash == h_in
        assert entry.output_hash == h_out
        assert len(entry.input_hash) == 16
        assert len(entry.output_hash) == 16


class TestLineageChain:
    """Chain builds correctly with parent_entry_id."""

    def test_chain_builds_with_parent(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        e1 = LineageEntry(process_id="proc1", node_id="n1")
        e2 = LineageEntry(process_id="proc1", node_id="n2", parent_entry_id=e1.entry_id)
        tracker.record(e1)
        tracker.record(e2)
        chain = tracker.get_chain("proc1")
        assert len(chain) == 2
        assert chain[1].parent_entry_id == chain[0].entry_id

    def test_empty_chain_returns_empty_list(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        chain = tracker.get_chain("nonexistent")
        assert chain == []

    def test_get_chain_by_process_id(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        tracker.record(LineageEntry(process_id="proc_a", node_id="n1"))
        tracker.record(LineageEntry(process_id="proc_b", node_id="n2"))
        tracker.record(LineageEntry(process_id="proc_a", node_id="n3"))
        chain_a = tracker.get_chain("proc_a")
        assert len(chain_a) == 2
        assert all(e.process_id == "proc_a" for e in chain_a)


class TestLineageSaveLoad:
    """Save/load round-trip preserves all fields."""

    def test_save_creates_file(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        tracker.record(LineageEntry(process_id="p1", node_id="n1"))
        tracker.save()
        assert (tmp_path / "integration_lineage.json").exists()

    def test_round_trip_preserves_fields(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        entry = LineageEntry(
            process_id="p1",
            node_id="n1",
            node_type="cognitive",
            capability="text.generate",
            provider_id="ollama",
            input_hash="abc123",
            output_hash="def456",
            duration_ms=42,
        )
        tracker.record(entry)
        tracker.save()

        data = json.loads((tmp_path / "integration_lineage.json").read_text())
        assert len(data) == 1
        loaded = data[0]
        assert loaded["process_id"] == "p1"
        assert loaded["node_type"] == "cognitive"
        assert loaded["capability"] == "text.generate"
        assert loaded["provider_id"] == "ollama"
        assert loaded["input_hash"] == "abc123"
        assert loaded["duration_ms"] == 42


class TestLineageIsolation:
    """Multiple processes don't cross-contaminate."""

    def test_separate_processes_isolated(self, tmp_path):
        tracker = LineageTracker(tmp_path)
        tracker.record(LineageEntry(process_id="alpha", node_id="a1"))
        tracker.record(LineageEntry(process_id="alpha", node_id="a2"))
        tracker.record(LineageEntry(process_id="beta", node_id="b1"))

        alpha = tracker.get_chain("alpha")
        beta = tracker.get_chain("beta")
        assert len(alpha) == 2
        assert len(beta) == 1
        assert alpha[0].process_id == "alpha"
        assert beta[0].process_id == "beta"
