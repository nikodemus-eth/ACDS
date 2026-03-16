"""Full coverage batch 1: action_compiler, delivery/validation, delivery/adapters, events/recorder.

Every test uses real objects — no mocks, no stubs, no faked data.
"""

from __future__ import annotations

import json
import os

import pytest

from swarm.compiler.action_compiler import ActionCompiler, CompilationResult
from swarm.delivery.adapters import DeliveryAdapter, EmailAdapter, TelegramAdapter
from swarm.delivery.validation import (
    load_smtp_profile,
    resolve_smtp_credentials,
    validate_email_policy,
)
from swarm.events.recorder import EventRecorder
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


# ── Shared fixtures ────────────────────────────────────────────


@pytest.fixture
def repo():
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    yield SwarmRepository(db)
    db.close()


@pytest.fixture
def recorder(repo):
    return EventRecorder(repo)


@pytest.fixture
def swarm_id(repo):
    return repo.create_swarm("BatchTest", "batch1 test swarm", "tester")


# ================================================================
# 1. ActionCompiler
# ================================================================


class TestActionCompiler:
    """Cover every code path in swarm/compiler/action_compiler.py."""

    def test_empty_action_list(self):
        compiler = ActionCompiler()
        result = compiler.compile([], None)
        assert isinstance(result, CompilationResult)
        assert result.success is True
        assert result.steps == []
        assert result.unmapped_actions == []
        assert result.plan_id.startswith("plan-")
        assert result.execution_mode == "sequential"

    # -- _FILE_OP_MAP paths --

    @pytest.mark.parametrize(
        "action_type, expected_op",
        [
            ("file_create", "create"),
            ("file_modify", "modify"),
            ("file_append", "append"),
            ("file_delete", "delete"),
            ("test_run", "run_test"),
        ],
    )
    def test_file_op_map(self, action_type, expected_op):
        compiler = ActionCompiler()
        entries = [
            {
                "action_type": action_type,
                "tool_name": "irrelevant",
                "parameters": {"path": "/tmp/x.py", "content": "hello", "command": "pytest"},
            }
        ]
        result = compiler.compile(entries)
        assert result.success is True
        step = result.steps[0]
        assert step["op"] == expected_op
        assert step["path"] == "/tmp/x.py"
        assert step["content"] == "hello"
        assert step["command"] == "pytest"

    # -- _FS_TOOLS path --

    @pytest.mark.parametrize(
        "tool_name",
        [
            "write", "read", "edit", "delete", "append",
            "file_write", "file_read", "file_edit", "file_delete", "file_append",
        ],
    )
    def test_fs_tool_path(self, tool_name):
        compiler = ActionCompiler()
        entries = [
            {
                "action_type": "unknown_action",
                "tool_name": tool_name,
                "parameters": {"path": "/a/b.txt", "content": "c"},
            }
        ]
        result = compiler.compile(entries)
        assert result.success is True
        step = result.steps[0]
        assert step["op"] == "modify"
        assert step["path"] == "/a/b.txt"

    # -- Capability invocation (known tool) --

    def test_capability_invocation(self):
        compiler = ActionCompiler()
        entries = [
            {
                "action_type": "custom_action",
                "tool_name": "my_custom_tool",
                "parameters": {"key": "val"},
            }
        ]
        result = compiler.compile(entries)
        assert result.success is True
        step = result.steps[0]
        assert step["op"] == "invoke_capability"
        assert step["tool_name"] == "my_custom_tool"
        assert step["action_type"] == "custom_action"
        assert step["parameters"] == {"key": "val"}

    # -- Unmapped action (no tool_name) --

    def test_unmapped_action_no_tool_name(self):
        compiler = ActionCompiler()
        entries = [
            {
                "action_type": "mystery",
                "tool_name": "",
                "parameters": {},
                "action_id": "act-001",
            }
        ]
        result = compiler.compile(entries)
        assert result.success is False
        assert "act-001" in result.unmapped_actions

    def test_unmapped_action_missing_tool_name_key(self):
        compiler = ActionCompiler()
        entries = [{"action_type": "mystery", "parameters": {}}]
        result = compiler.compile(entries)
        assert result.success is False
        assert result.unmapped_actions == ["unknown-0"]

    # -- compile_to_behavior_steps convenience --

    def test_compile_to_behavior_steps(self):
        compiler = ActionCompiler()
        entries = [
            {"action_type": "file_create", "tool_name": "", "parameters": {"path": "f.py"}},
        ]
        steps = compiler.compile_to_behavior_steps(entries, context={"env": "test"})
        assert isinstance(steps, list)
        assert steps[0]["op"] == "create"

    # -- CompilationResult fields --

    def test_compilation_result_error_field(self):
        r = CompilationResult(
            success=False,
            plan_id="plan-abc",
            error="something broke",
            unmapped_actions=["a"],
        )
        assert r.error == "something broke"
        assert r.success is False


# ================================================================
# 2. delivery/validation
# ================================================================


class TestLoadSmtpProfile:
    def test_file_not_found(self, tmp_path):
        result = load_smtp_profile(tmp_path)
        assert result is None

    def test_valid_json(self, tmp_path):
        policy_dir = tmp_path / "policies"
        policy_dir.mkdir()
        profile = {"host": "mail.example.com", "port": 587, "enabled": True}
        (policy_dir / "smtp_relay_profile.json").write_text(json.dumps(profile))
        result = load_smtp_profile(tmp_path)
        assert result == profile

    def test_invalid_json(self, tmp_path):
        policy_dir = tmp_path / "policies"
        policy_dir.mkdir()
        (policy_dir / "smtp_relay_profile.json").write_text("{bad json!!!")
        with pytest.raises(ValueError, match="Invalid SMTP relay profile"):
            load_smtp_profile(tmp_path)


class TestResolveSmtpCredentials:
    def test_with_env_vars(self, monkeypatch):
        monkeypatch.setenv("MY_SMTP_USER", "alice")
        monkeypatch.setenv("MY_SMTP_PASS", "s3cret")
        profile = {
            "auth": {
                "username_env": "MY_SMTP_USER",
                "password_env": "MY_SMTP_PASS",
            }
        }
        user, pw = resolve_smtp_credentials(profile)
        assert user == "alice"
        assert pw == "s3cret"

    def test_without_env_vars(self, monkeypatch):
        monkeypatch.delenv("NONEXISTENT_USER", raising=False)
        monkeypatch.delenv("NONEXISTENT_PASS", raising=False)
        profile = {
            "auth": {
                "username_env": "NONEXISTENT_USER",
                "password_env": "NONEXISTENT_PASS",
            }
        }
        user, pw = resolve_smtp_credentials(profile)
        assert user is None
        assert pw is None

    def test_missing_auth_section(self):
        user, pw = resolve_smtp_credentials({})
        assert user is None
        assert pw is None


class TestValidateEmailPolicy:
    def _profile(self, **overrides):
        base = {
            "enabled": True,
            "policy": {
                "allowed_sender_identities": ["bot@example.com"],
                "max_recipients": 3,
                "allowed_recipient_domains": ["example.com"],
                "max_subject_length": 50,
                "require_plain_text": True,
                "max_body_bytes": 1024,
                "allow_attachments": False,
            },
        }
        base.update(overrides)
        return base

    def _msg(self, **overrides):
        base = {
            "sender": "bot@example.com",
            "recipients": ["user@example.com"],
            "subject": "Hello",
            "body_plain": "Body text",
        }
        base.update(overrides)
        return base

    def test_disabled_profile(self):
        errors = validate_email_policy(self._msg(), self._profile(enabled=False))
        assert any("disabled" in e for e in errors)
        assert len(errors) == 1  # early return

    def test_invalid_sender(self):
        errors = validate_email_policy(
            self._msg(sender="hacker@evil.com"), self._profile()
        )
        assert any("not in allowed_sender_identities" in e for e in errors)

    def test_no_recipients(self):
        errors = validate_email_policy(
            self._msg(recipients=[], cc=[], bcc=[]),
            self._profile(),
        )
        # Set msg without recipients key
        msg = self._msg()
        msg["recipients"] = []
        errors = validate_email_policy(msg, self._profile())
        assert any("No recipients" in e for e in errors)

    def test_too_many_recipients(self):
        msg = self._msg(recipients=["a@example.com", "b@example.com", "c@example.com", "d@example.com"])
        errors = validate_email_policy(msg, self._profile())
        assert any("exceeds limit" in e for e in errors)

    def test_invalid_domain(self):
        msg = self._msg(recipients=["user@notallowed.com"])
        errors = validate_email_policy(msg, self._profile())
        assert any("not in allowed_recipient_domains" in e for e in errors)

    def test_empty_subject(self):
        msg = self._msg(subject="")
        errors = validate_email_policy(msg, self._profile())
        assert any("Subject is empty" in e for e in errors)

    def test_long_subject(self):
        msg = self._msg(subject="X" * 51)
        errors = validate_email_policy(msg, self._profile())
        assert any("Subject length" in e for e in errors)

    def test_empty_body_when_required(self):
        msg = self._msg(body_plain="")
        errors = validate_email_policy(msg, self._profile())
        assert any("Plain text body is required" in e for e in errors)

    def test_body_too_large(self):
        msg = self._msg(body_plain="X" * 2000)
        errors = validate_email_policy(msg, self._profile())
        assert any("Body size exceeds" in e for e in errors)

    def test_disallowed_attachments(self):
        msg = self._msg(attachments=["file.zip"])
        errors = validate_email_policy(msg, self._profile())
        assert any("Attachments are not allowed" in e for e in errors)

    def test_all_checks_pass(self):
        profile = self._profile()
        profile["policy"]["allow_attachments"] = True
        msg = self._msg()
        errors = validate_email_policy(msg, profile)
        assert errors == []


# ================================================================
# 3. delivery/adapters
# ================================================================


class TestDeliveryAdapter:
    def test_base_send_raises(self):
        with pytest.raises(NotImplementedError):
            DeliveryAdapter().send("dest", {})


class TestEmailAdapter:
    def test_stub_mode_no_config(self):
        adapter = EmailAdapter()
        assert adapter._is_stub is True
        result = adapter.send("x@test.com", {"run_id": "r1", "swarm_name": "s"})
        assert result["success"] is True
        assert "stub" in result["provider_message_id"]

    def test_stub_mode_empty_host(self):
        adapter = EmailAdapter(smtp_config={"host": ""})
        assert adapter._is_stub is True
        result = adapter.send("x@test.com", {"run_id": "r2"})
        assert result["success"] is True

    def test_policy_rejection(self):
        config = {
            "host": "smtp.example.com",
            "port": 587,
            "enabled": True,
            "sender": {"address": "bad@evil.com"},
            "policy": {
                "allowed_sender_identities": ["good@example.com"],
                "max_recipients": 10,
                "max_subject_length": 200,
                "require_plain_text": False,
                "max_body_bytes": 102400,
                "allow_attachments": True,
            },
        }
        adapter = EmailAdapter(smtp_config=config)
        assert adapter._is_stub is False
        result = adapter.send("dest@example.com", {"subject": "Hi", "body": "hello"})
        assert result["success"] is False
        assert "POLICY_REJECTED" in result["provider_response"]

    def test_smtp_connection_failure(self):
        """Use a port nothing listens on to trigger OSError."""
        config = {
            "host": "127.0.0.1",
            "port": 1,  # almost certainly refused
            "enabled": True,
            "sender": {"address": "bot@example.com"},
            "policy": {},  # no restrictions → passes validation
            "connection": {"timeout_seconds": 2},
        }
        adapter = EmailAdapter(smtp_config=config)
        result = adapter.send("dest@example.com", {"subject": "Hi", "body": "b"})
        assert result["success"] is False
        assert "TRANSPORT_FAILED" in result["provider_response"]


class TestTelegramAdapter:
    def test_send(self):
        adapter = TelegramAdapter()
        result = adapter.send("chat123", {"run_id": "r5", "swarm_name": "s"})
        assert result["success"] is True
        assert "tg-stub-r5" == result["provider_message_id"]


# ================================================================
# 4. events/recorder — all uncovered convenience methods
# ================================================================


class TestEventRecorderUncoveredMethods:
    def test_swarm_enabled(self, recorder, swarm_id):
        eid = recorder.swarm_enabled(swarm_id, "admin")
        assert eid.startswith("evt-")

    def test_swarm_paused(self, recorder, swarm_id):
        eid = recorder.swarm_paused(swarm_id, "admin")
        assert eid.startswith("evt-")

    def test_action_updated(self, recorder, swarm_id):
        eid = recorder.action_updated(swarm_id, "act-1", ["status", "priority"])
        assert eid.startswith("evt-")

    def test_tool_registered(self, recorder, repo):
        # tool_registered uses swarm_id="__platform__" — must exist in DB
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        repo.conn.execute(
            "INSERT INTO swarms (swarm_id, swarm_name, description, created_by, "
            "lifecycle_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("__platform__", "__platform__", "Platform events", "system",
             "enabled", now, now),
        )
        repo.conn.commit()
        eid = recorder.tool_registered("tool-99", "my_tool")
        assert eid.startswith("evt-")

    def test_schedule_config_changed(self, recorder, swarm_id):
        eid = recorder.schedule_config_changed(
            swarm_id, "sched-1", {"cron": "0 * * * *"}
        )
        assert eid.startswith("evt-")

    def test_delivery_config_changed(self, recorder, swarm_id):
        eid = recorder.delivery_config_changed(
            swarm_id, "del-1", {"channel": "email"}
        )
        assert eid.startswith("evt-")

    def test_execution_preconditions_verified(self, recorder, swarm_id):
        eid = recorder.execution_preconditions_verified(
            swarm_id, "run-1", {"disk": "ok", "memory": "ok"}
        )
        assert eid.startswith("evt-")

    def test_archetype_classified(self, recorder, swarm_id):
        eid = recorder.archetype_classified(
            swarm_id, "data_pipeline", 0.95, archetype_id="arch-1"
        )
        assert eid.startswith("evt-")

    def test_constraints_extracted(self, recorder, swarm_id):
        eid = recorder.constraints_extracted(swarm_id, 5, constraint_set_id="cs-1")
        assert eid.startswith("evt-")

    def test_action_skeleton_loaded(self, recorder, swarm_id):
        eid = recorder.action_skeleton_loaded(swarm_id, "etl_template", 8)
        assert eid.startswith("evt-")

    def test_action_table_specialized(self, recorder, swarm_id):
        eid = recorder.action_table_specialized(swarm_id, 8, 12)
        assert eid.startswith("evt-")

    def test_dependencies_assigned(self, recorder, swarm_id):
        eid = recorder.dependencies_assigned(swarm_id, 6)
        assert eid.startswith("evt-")

    def test_tool_matching_completed(self, recorder, swarm_id):
        eid = recorder.tool_matching_completed(swarm_id, 12, 10, 2)
        assert eid.startswith("evt-")

    def test_action_table_reviewed(self, recorder, swarm_id):
        eid = recorder.action_table_reviewed(swarm_id, 3)
        assert eid.startswith("evt-")

    def test_action_table_accepted(self, recorder, swarm_id):
        eid = recorder.action_table_accepted(
            swarm_id, "reviewer-1", acceptance_id="acc-1"
        )
        assert eid.startswith("evt-")

    def test_events_persist_in_db(self, recorder, repo, swarm_id):
        """Verify events are actually written to the real SQLite database."""
        recorder.swarm_enabled(swarm_id, "admin")
        recorder.swarm_paused(swarm_id, "admin")
        events = repo.list_events(swarm_id)
        types = [e["event_type"] for e in events]
        assert "swarm_enabled" in types
        assert "swarm_paused" in types
