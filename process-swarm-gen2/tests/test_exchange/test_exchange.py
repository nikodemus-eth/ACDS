"""Tests for exchange ingress and receipts."""

from __future__ import annotations

import json

import pytest

from runtime.exchange.ingress import FORBIDDEN_FROM_M2, IngressHandler
from runtime.exchange.receipt import create_receipt, save_receipt
from runtime.identity.signer import verify_attached_signature


class TestIngressHandler:
    def test_quarantine_flow(self, tmp_path, schemas_dir, sample_proposal):
        ingress = tmp_path / "ingress"
        exports = tmp_path / "exports"
        exports.mkdir()

        # Write a valid proposal to exports
        prop_path = exports / "test_proposal.json"
        with open(prop_path, "w") as f:
            json.dump(sample_proposal, f)

        handler = IngressHandler(ingress, schemas_dir)

        # Scan and quarantine
        artifacts = handler.scan_exports(exports)
        assert len(artifacts) == 1
        handler.quarantine(artifacts[0])

        # Process
        results = handler.process_quarantine()
        assert len(results) == 1
        assert results[0]["status"] == "accepted"

    def test_rejects_forbidden_type(self, tmp_path, schemas_dir):
        ingress = tmp_path / "ingress"
        exports = tmp_path / "exports"
        exports.mkdir()

        # Write artifact with execution_plan markers
        plan = {
            "plan_id": "evil-plan",
            "steps": [{"step_id": "s1"}],
            "required_capabilities": ["FILESYSTEM_WRITE"],
        }
        with open(exports / "evil.json", "w") as f:
            json.dump(plan, f)

        handler = IngressHandler(ingress, schemas_dir)
        for a in handler.scan_exports(exports):
            handler.quarantine(a)
        results = handler.process_quarantine()
        assert results[0]["status"] == "rejected"

    def test_rejects_invalid_json(self, tmp_path, schemas_dir):
        ingress = tmp_path / "ingress"
        exports = tmp_path / "exports"
        exports.mkdir()
        (exports / "bad.json").write_text("not json{{{")

        handler = IngressHandler(ingress, schemas_dir)
        for a in handler.scan_exports(exports):
            handler.quarantine(a)
        results = handler.process_quarantine()
        assert results[0]["status"] == "rejected"


class TestReceipt:
    def test_creates_signed_receipt(self, keys_dir):
        receipt = create_receipt("art-1", "m2", "accepted", keys_dir)
        assert receipt["artifact_id"] == "art-1"
        assert receipt["origin_node"] == "m2"
        assert verify_attached_signature(receipt, keys_dir)

    def test_save_receipt(self, keys_dir, tmp_path):
        receipt = create_receipt("art-1", "m2", "accepted", keys_dir)
        path = save_receipt(receipt, tmp_path / "exchange")
        assert path.exists()
