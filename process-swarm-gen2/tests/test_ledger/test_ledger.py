"""Tests for execution ledger."""

from __future__ import annotations

import pytest

from runtime.identity.signer import verify_attached_signature
from runtime.ledger.ledger_writer import (
    append_to_log,
    load_record,
    record_execution,
    save_record,
)


class TestRecordExecution:
    def test_creates_record(self, keys_dir):
        record = record_execution(
            "plan-1", "lease-1", [], [], [], "completed", keys_dir
        )
        assert "record_id" in record
        assert record["plan_id"] == "plan-1"
        assert record["execution_status"] == "completed"

    def test_record_is_signed(self, keys_dir):
        record = record_execution(
            "plan-1", "lease-1", [], [], [], "completed", keys_dir
        )
        assert record["signature"]["signer_role"] == "node_attestation_signer"
        assert verify_attached_signature(record, keys_dir)

    def test_has_timestamp(self, keys_dir):
        record = record_execution(
            "plan-1", "lease-1", [], [], [], "completed", keys_dir
        )
        assert "executed_at" in record


class TestSaveAndLoad:
    def test_roundtrip(self, keys_dir, tmp_path):
        record = record_execution(
            "plan-1", "lease-1", [], [], [], "completed", keys_dir
        )
        path = save_record(record, tmp_path / "exec")
        loaded = load_record(path)
        assert loaded["record_id"] == record["record_id"]


class TestAppendToLog:
    def test_appends_line(self, keys_dir, tmp_path):
        log = tmp_path / "ledger.log"
        record = record_execution(
            "plan-1", "lease-1", [], [], [], "completed", keys_dir
        )
        append_to_log(record, log)
        text = log.read_text()
        assert "plan=plan-1" in text
        assert "status=completed" in text

    def test_append_only(self, keys_dir, tmp_path):
        log = tmp_path / "ledger.log"
        r1 = record_execution("p1", "l1", [], [], [], "completed", keys_dir)
        r2 = record_execution("p2", "l2", [], [], [], "failed", keys_dir)
        append_to_log(r1, log)
        append_to_log(r2, log)
        lines = log.read_text().strip().split("\n")
        assert len(lines) == 2
