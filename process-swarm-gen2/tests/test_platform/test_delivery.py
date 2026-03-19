"""Tests for the delivery engine and adapters."""

from __future__ import annotations

import pytest

from swarm.delivery.adapters import EmailAdapter, TelegramAdapter
from swarm.delivery.engine import DeliveryEngine
from swarm.events.recorder import EventRecorder
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def db():
    database = RegistryDatabase(":memory:")
    database.connect()
    database.migrate()
    yield database
    database.close()


@pytest.fixture
def repo(db):
    return SwarmRepository(db)


@pytest.fixture
def events(repo):
    return EventRecorder(repo)


@pytest.fixture
def engine(repo, events):
    return DeliveryEngine(repo, events)


@pytest.fixture
def swarm_with_delivery(repo):
    """Create a swarm with email delivery configured."""
    swarm_id = repo.create_swarm("Test Swarm", "A test swarm", "user-1")
    dlvr_id = repo.create_delivery(swarm_id, "email", "user@example.com")
    repo.update_swarm(swarm_id, delivery_id=dlvr_id)
    return swarm_id


@pytest.fixture
def swarm_with_telegram(repo):
    """Create a swarm with telegram delivery configured."""
    swarm_id = repo.create_swarm("TG Swarm", "Telegram test", "user-1")
    dlvr_id = repo.create_delivery(swarm_id, "telegram", "chat-12345")
    repo.update_swarm(swarm_id, delivery_id=dlvr_id)
    return swarm_id


# ──────────────────────────────────────────────
# Adapter tests
# ──────────────────────────────────────────────


class TestAdapters:
    def test_email_adapter_unconfigured_reports_failure(self):
        adapter = EmailAdapter()
        result = adapter.send("user@example.com", {
            "subject": "Test",
            "body": "Hello",
            "swarm_name": "Test",
            "run_id": "run-001",
            "status": "succeeded",
        })
        assert result["success"] is False
        assert "not configured" in result["provider_response"]

    def test_telegram_adapter_unconfigured(self):
        adapter = TelegramAdapter()  # No token → honest failure
        result = adapter.send("chat-12345", {
            "body": "Hello",
            "swarm_name": "Test",
            "run_id": "run-001",
            "status": "succeeded",
        })
        assert result["success"] is False
        assert "not configured" in result["provider_response"]


# ──────────────────────────────────────────────
# Engine tests
# ──────────────────────────────────────────────


class TestDeliveryEngine:
    def test_deliver_with_email_unconfigured(self, engine, repo, swarm_with_delivery):
        """Without SMTP config, email delivery reports honest failure."""
        run_id = repo.create_run(swarm_with_delivery, "manual")
        repo.update_run(
            run_id,
            run_status="succeeded",
            runtime_execution_id="exec-001",
            artifact_refs_json='["artifact-1"]',
        )
        receipt_id = engine.deliver(run_id)
        assert receipt_id is not None
        receipt = repo.get_delivery_receipt(receipt_id)
        assert receipt["delivery_status"] == "failed"
        assert receipt["delivery_type"] == "email"

    def test_deliver_with_telegram(self, engine, repo, swarm_with_telegram):
        run_id = repo.create_run(swarm_with_telegram, "manual")
        repo.update_run(
            run_id,
            run_status="succeeded",
            runtime_execution_id="exec-002",
            artifact_refs_json='["artifact-1"]',
        )
        receipt_id = engine.deliver(run_id)
        assert receipt_id is not None
        receipt = repo.get_delivery_receipt(receipt_id)
        assert receipt["delivery_type"] == "telegram"

    def test_no_delivery_configured(self, engine, repo):
        swarm_id = repo.create_swarm("No Delivery", "desc", "user")
        run_id = repo.create_run(swarm_id, "manual")
        receipt_id = engine.deliver(run_id)
        assert receipt_id is None

    def test_delivery_updates_run_status(self, engine, repo, swarm_with_delivery):
        run_id = repo.create_run(swarm_with_delivery, "manual")
        repo.update_run(
            run_id,
            run_status="succeeded",
            runtime_execution_id="exec-003",
            artifact_refs_json='["artifact-1"]',
        )
        engine.deliver(run_id)
        run = repo.get_run(run_id)
        assert run["delivery_status"] == "failed"  # No SMTP config → honest failure

    def test_delivery_records_failure_event(self, engine, repo, events, swarm_with_delivery):
        """Without SMTP config, delivery records a failure event."""
        run_id = repo.create_run(swarm_with_delivery, "manual")
        repo.update_run(
            run_id,
            run_status="succeeded",
            runtime_execution_id="exec-004",
            artifact_refs_json='["artifact-1"]',
        )
        engine.deliver(run_id)
        evts = repo.list_events(swarm_with_delivery, event_type="delivery_failed")
        assert len(evts) == 1

    def test_delivery_nonexistent_run(self, engine):
        result = engine.deliver("nonexistent-run")
        assert result is None

    def test_message_includes_swarm_info(self, engine, repo, swarm_with_delivery):
        run_id = repo.create_run(swarm_with_delivery, "manual")
        repo.update_run(
            run_id,
            run_status="succeeded",
            runtime_execution_id="exec-005",
            artifact_refs_json='["artifact-1"]',
        )
        swarm = repo.get_swarm(swarm_with_delivery)
        run = repo.get_run(run_id)
        message = engine._build_message(
            swarm, run, repo.get_delivery(swarm["delivery_id"])
        )
        assert "Test Swarm" in message["subject"]
        assert message["run_id"] == run_id

    def test_failed_adapter_records_failure(self, engine, repo, swarm_with_delivery):
        class FailingAdapter:
            def send(self, dest, msg):
                raise ConnectionError("SMTP connection failed")

        engine.adapters["email"] = FailingAdapter()
        run_id = repo.create_run(swarm_with_delivery, "manual")
        repo.update_run(
            run_id,
            run_status="succeeded",
            runtime_execution_id="exec-006",
            artifact_refs_json='["artifact-1"]',
        )
        receipt_id = engine.deliver(run_id)
        assert receipt_id is not None
        receipt = repo.get_delivery_receipt(receipt_id)
        assert receipt["delivery_status"] == "failed"
        run = repo.get_run(run_id)
        assert run["delivery_status"] == "failed"

    def test_delivery_blocked_without_runtime_truth(
        self, engine, repo, swarm_with_delivery
    ):
        run_id = repo.create_run(swarm_with_delivery, "manual")
        repo.update_run(run_id, run_status="succeeded")
        receipt_id = engine.deliver(run_id)
        assert receipt_id is None
        warnings = repo.list_governance_warning_records(run_id=run_id)
        assert any(w["warning_family"] == "secondary_truth" for w in warnings)
