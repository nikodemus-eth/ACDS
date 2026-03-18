"""Tests for swarm.argus_hold.ledger_writer — LedgerWriter."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from swarm.argus_hold.config import ARGUSHoldConfig
from swarm.argus_hold.ledger_writer import GENESIS_HASH, LedgerWriter
from swarm.argus_hold.models import (
    CommandEnvelope,
    LedgerEntry,
    SideEffectLevel,
    StageResult,
    StageVerdict,
    new_id,
    now_utc,
)


def _make_envelope(command_name: str = "filesystem.read_file") -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name=command_name,
        version="v1",
        parameters={"path": "test.txt"},
        side_effect_level=SideEffectLevel.READ_ONLY,
        run_id="run-test",
        swarm_id="swarm-test",
        created_at=now_utc(),
    )


def _make_stages() -> list[StageResult]:
    return [
        StageResult(stage_name="normalize", verdict=StageVerdict.PASSED, duration_ms=1),
        StageResult(stage_name="validate", verdict=StageVerdict.PASSED, duration_ms=2),
    ]


class TestLedgerWriterAppend:
    """Tests for LedgerWriter.append()."""

    def test_append_returns_ledger_entry(self, config):
        writer = LedgerWriter(config)
        env = _make_envelope()
        entry = writer.append(env, _make_stages(), "executed")
        assert isinstance(entry, LedgerEntry)

    def test_genesis_entry_has_zero_prev_hash(self, config):
        writer = LedgerWriter(config)
        env = _make_envelope()
        entry = writer.append(env, _make_stages(), "executed")
        assert entry.prev_hash == GENESIS_HASH
        assert entry.sequence_number == 0

    def test_second_entry_chains_correctly(self, config):
        writer = LedgerWriter(config)
        e1 = writer.append(_make_envelope(), _make_stages(), "executed")
        e2 = writer.append(_make_envelope(), _make_stages(), "executed")
        assert e2.prev_hash == e1.chain_hash
        assert e2.sequence_number == 1

    def test_three_entries_chain(self, config):
        writer = LedgerWriter(config)
        entries = []
        for i in range(3):
            e = writer.append(_make_envelope(), _make_stages(), "executed")
            entries.append(e)
        assert entries[1].prev_hash == entries[0].chain_hash
        assert entries[2].prev_hash == entries[1].chain_hash
        assert entries[2].sequence_number == 2

    def test_ledger_file_created(self, config):
        writer = LedgerWriter(config)
        writer.append(_make_envelope(), _make_stages(), "executed")
        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        assert ledger_path.exists()

    def test_ledger_file_has_jsonl_lines(self, config):
        writer = LedgerWriter(config)
        for _ in range(3):
            writer.append(_make_envelope(), _make_stages(), "executed")
        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        lines = [l for l in ledger_path.read_text().strip().split("\n") if l.strip()]
        assert len(lines) == 3
        # Each line is valid JSON
        for line in lines:
            json.loads(line)

    def test_outcome_recorded(self, config):
        writer = LedgerWriter(config)
        entry = writer.append(_make_envelope(), _make_stages(), "denied")
        assert entry.outcome == "denied"

    def test_stage_summary_captured(self, config):
        writer = LedgerWriter(config)
        entry = writer.append(_make_envelope(), _make_stages(), "executed")
        assert entry.stage_summary["normalize"] == "passed"
        assert entry.stage_summary["validate"] == "passed"

    def test_denied_commands_produce_entries(self, config):
        writer = LedgerWriter(config)
        stages = [
            StageResult(stage_name="policy", verdict=StageVerdict.FAILED, duration_ms=1),
        ]
        entry = writer.append(_make_envelope(), stages, "denied")
        assert entry.outcome == "denied"
        assert entry.stage_summary["policy"] == "failed"

    def test_entry_id_has_led_prefix(self, config):
        writer = LedgerWriter(config)
        entry = writer.append(_make_envelope(), _make_stages(), "executed")
        assert entry.entry_id.startswith("led-")

    def test_content_hash_is_hex(self, config):
        writer = LedgerWriter(config)
        entry = writer.append(_make_envelope(), _make_stages(), "executed")
        assert len(entry.content_hash) == 64
        int(entry.content_hash, 16)  # Should not raise

    def test_chain_hash_is_hex(self, config):
        writer = LedgerWriter(config)
        entry = writer.append(_make_envelope(), _make_stages(), "executed")
        assert len(entry.chain_hash) == 64
        int(entry.chain_hash, 16)


class TestLedgerWriterVerifyChain:
    """Tests for LedgerWriter.verify_chain()."""

    def test_valid_chain_no_violations(self, config):
        writer = LedgerWriter(config)
        for _ in range(5):
            writer.append(_make_envelope(), _make_stages(), "executed")
        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        violations = LedgerWriter.verify_chain(ledger_path)
        assert violations == []

    def test_tampered_content_detected(self, config):
        writer = LedgerWriter(config)
        writer.append(_make_envelope(), _make_stages(), "executed")
        writer.append(_make_envelope(), _make_stages(), "executed")

        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        lines = ledger_path.read_text().strip().split("\n")
        # Tamper with the first entry
        entry = json.loads(lines[0])
        entry["command_name"] = "TAMPERED"
        lines[0] = json.dumps(entry, separators=(",", ":"))
        ledger_path.write_text("\n".join(lines) + "\n")

        violations = LedgerWriter.verify_chain(ledger_path)
        assert len(violations) > 0
        assert any("content_hash" in v for v in violations)

    def test_broken_chain_hash_detected(self, config):
        writer = LedgerWriter(config)
        writer.append(_make_envelope(), _make_stages(), "executed")
        writer.append(_make_envelope(), _make_stages(), "executed")

        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        lines = ledger_path.read_text().strip().split("\n")
        # Tamper with the chain hash of entry 0
        entry = json.loads(lines[0])
        entry["chain_hash"] = "0" * 64
        lines[0] = json.dumps(entry, separators=(",", ":"))
        ledger_path.write_text("\n".join(lines) + "\n")

        violations = LedgerWriter.verify_chain(ledger_path)
        assert len(violations) > 0

    def test_verify_chain_ignores_blank_lines(self, config):
        writer = LedgerWriter(config)
        writer.append(_make_envelope(), _make_stages(), "executed")
        writer.append(_make_envelope(), _make_stages(), "executed")

        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        lines = ledger_path.read_text().strip().split("\n")
        # Insert blank lines between and around entries
        padded = "\n\n" + lines[0] + "\n\n\n" + lines[1] + "\n\n"
        ledger_path.write_text(padded)

        violations = LedgerWriter.verify_chain(ledger_path)
        assert violations == []

    def test_nonexistent_file_returns_empty(self, tmp_path):
        violations = LedgerWriter.verify_chain(tmp_path / "no_such_file.jsonl")
        assert violations == []


class TestLedgerWriterRecovery:
    """Tests for recovery from existing ledger file."""

    def test_recovery_continues_chain(self, config):
        # Write 2 entries
        writer1 = LedgerWriter(config)
        writer1.append(_make_envelope(), _make_stages(), "executed")
        e2 = writer1.append(_make_envelope(), _make_stages(), "executed")

        # Create a new writer that should recover state
        writer2 = LedgerWriter(config)
        e3 = writer2.append(_make_envelope(), _make_stages(), "executed")
        assert e3.prev_hash == e2.chain_hash
        assert e3.sequence_number == 2

        # Verify full chain
        ledger_path = Path(config.ledger_root) / "argus_hold_ledger.jsonl"
        violations = LedgerWriter.verify_chain(ledger_path)
        assert violations == []
