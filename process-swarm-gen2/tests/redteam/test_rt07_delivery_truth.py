from __future__ import annotations

import inspect

import pytest

from swarm.delivery.adapters import DeliveryAdapter
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


# ──────────────────────────────────────────────
# RT07-A: Delivery Boundary
# ──────────────────────────────────────────────


class TestDeliveryBoundary:
    def test_delivery_engine_has_no_runtime_imports(self):
        source = inspect.getsource(DeliveryEngine)
        forbidden = [
            "runtime.pipeline",
            "runtime.executor",
            "runtime.gate",
            "PipelineRunner",
            "ToolGate",
        ]
        for token in forbidden:
            assert token not in source, f"DeliveryEngine source contains '{token}'"

    def test_delivery_engine_only_uses_registry_and_events(self):
        sig = inspect.signature(DeliveryEngine.__init__)
        param_names = set(sig.parameters.keys())
        assert param_names == {"self", "repository", "event_recorder", "smtp_config", "telegram_bot_token"}

    def test_deliver_takes_only_run_id(self, repo, events):
        sig = inspect.signature(DeliveryEngine.deliver)
        param_names = {
            k for k, v in sig.parameters.items() if k != "self"
        }
        assert param_names == {"run_id"}

    def test_delivery_engine_cannot_create_runs(self, repo, events):
        engine = DeliveryEngine(repo, events)
        assert not hasattr(engine, "create_run")
        assert not hasattr(engine, "start_run")
        assert not hasattr(engine, "execute_run")


# ──────────────────────────────────────────────
# RT07-B: Delivery Receipt Truth
# ──────────────────────────────────────────────


class TestDeliveryReceiptTruth:
    def test_receipt_for_nonexistent_run(self, repo, events):
        engine = DeliveryEngine(repo, events)
        result = engine.deliver("nonexistent")
        assert result is None

    def test_receipt_without_delivery_config(self, repo, events):
        engine = DeliveryEngine(repo, events)
        swarm_id = repo.create_swarm("No Delivery", "desc", "user-1")
        run_id = repo.create_run(swarm_id, "manual")
        repo.update_run(run_id, run_status="succeeded")
        result = engine.deliver(run_id)
        assert result is None

    def test_delivery_message_reflects_failed_status(self, repo, events):
        engine = DeliveryEngine(repo, events)
        swarm_id = repo.create_swarm("Fail Swarm", "desc", "user-1")
        dlvr_id = repo.create_delivery(swarm_id, "email", "user@example.com")
        repo.update_swarm(swarm_id, delivery_id=dlvr_id)
        run_id = repo.create_run(swarm_id, "manual")
        repo.update_run(run_id, run_status="failed")

        swarm = repo.get_swarm(swarm_id)
        run = repo.get_run(run_id)
        delivery_config = repo.get_delivery(dlvr_id)
        message = engine._build_message(swarm, run, delivery_config)

        assert "failed" in message["status"]
        assert "Failed" in message["subject"]

    def test_delivery_message_reflects_success(self, repo, events):
        engine = DeliveryEngine(repo, events)
        swarm_id = repo.create_swarm("Success Swarm", "desc", "user-1")
        dlvr_id = repo.create_delivery(swarm_id, "email", "user@example.com")
        repo.update_swarm(swarm_id, delivery_id=dlvr_id)
        run_id = repo.create_run(swarm_id, "manual")
        repo.update_run(run_id, run_status="succeeded")

        swarm = repo.get_swarm(swarm_id)
        run = repo.get_run(run_id)
        delivery_config = repo.get_delivery(dlvr_id)
        message = engine._build_message(swarm, run, delivery_config)

        assert "succeeded" in message["status"]
        assert "Completed" in message["subject"]


# ──────────────────────────────────────────────
# RT07-C: Delivery Adapter Boundary
# ──────────────────────────────────────────────


class TestDeliveryAdapterBoundary:
    def test_adapter_has_send_method(self):
        public_methods = [
            m for m in dir(DeliveryAdapter) if not m.startswith("_")
        ]
        assert "send" in public_methods
