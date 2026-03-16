"""Tests for the Session Watcher."""

from __future__ import annotations

import json

import pytest

from swarm.bridge.session_watcher import SessionWatcher


@pytest.fixture
def watcher_env(tmp_path):
    """Create watcher environment with openclaw_root and state_home."""
    root = tmp_path / "openclaw"
    root.mkdir()
    state = tmp_path / "state"
    state.mkdir()
    return root, state


@pytest.fixture
def watcher(watcher_env):
    root, state = watcher_env
    return SessionWatcher(root, state)


def _write_session_file(state_home, session_name, entries):
    """Write a JSONL session file."""
    sessions_dir = state_home / "agents" / "main" / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    path = sessions_dir / f"{session_name}.jsonl"
    with open(path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")
    return path


class TestSessionWatcher:
    def test_scan_empty_sessions_dir(self, watcher):
        count = watcher.scan_sessions()
        assert count == 0

    def test_scan_with_user_assistant_pair(self, watcher_env):
        root, state = watcher_env
        entries = [
            {
                "type": "message",
                "id": "msg-001",
                "message": {"role": "user", "content": "Hello"},
            },
            {
                "type": "message",
                "id": "msg-002",
                "message": {"role": "assistant", "content": "Hi there!"},
            },
        ]
        _write_session_file(state, "test-session", entries)

        watcher = SessionWatcher(root, state)
        count = watcher.scan_sessions()
        assert count == 1

    def test_scan_skips_system_messages(self, watcher_env):
        root, state = watcher_env
        entries = [
            {
                "type": "message",
                "id": "msg-001",
                "message": {
                    "role": "user",
                    "content": "A new session was started by the system",
                },
            },
            {
                "type": "message",
                "id": "msg-002",
                "message": {"role": "assistant", "content": "Welcome!"},
            },
        ]
        _write_session_file(state, "test-session", entries)

        watcher = SessionWatcher(root, state)
        count = watcher.scan_sessions()
        # System message should be skipped, no user message -> no pair
        assert count == 0

    def test_cursor_persistence(self, watcher_env):
        root, state = watcher_env
        entries = [
            {
                "type": "message",
                "id": "msg-001",
                "message": {"role": "user", "content": "First"},
            },
            {
                "type": "message",
                "id": "msg-002",
                "message": {"role": "assistant", "content": "Response 1"},
            },
        ]
        _write_session_file(state, "test-session", entries)

        watcher1 = SessionWatcher(root, state)
        count1 = watcher1.scan_sessions()
        assert count1 == 1

        # Second scan should find no new entries
        watcher2 = SessionWatcher(root, state)
        count2 = watcher2.scan_sessions()
        assert count2 == 0

    def test_creates_artifacts(self, watcher_env):
        root, state = watcher_env
        entries = [
            {
                "type": "message",
                "id": "msg-001",
                "message": {"role": "user", "content": "Test query"},
            },
            {
                "type": "message",
                "id": "msg-002",
                "message": {"role": "assistant", "content": "Test response"},
            },
        ]
        _write_session_file(state, "test-session", entries)

        watcher = SessionWatcher(root, state)
        watcher.scan_sessions()

        # Should have created M4 artifacts
        artifacts = root / "artifacts"
        assert artifacts.exists()
        assert len(list((artifacts / "proposals").glob("*.json"))) == 1
        assert len(list((artifacts / "executions").glob("*.json"))) == 1


class TestExtractUserText:
    def test_plain_text(self):
        assert SessionWatcher._extract_user_text("Hello world") == "Hello world"

    def test_empty_text_returns_none(self):
        assert SessionWatcher._extract_user_text("") is None
        assert SessionWatcher._extract_user_text("   ") is None

    def test_system_message_returns_none(self):
        assert SessionWatcher._extract_user_text(
            "A new session was started by the system"
        ) is None

    def test_strips_timestamp_prefix(self):
        text = "[Mon 2026-03-10 09:13 PDT] Hello world"
        assert SessionWatcher._extract_user_text(text) == "Hello world"

    def test_strips_metadata_wrapper(self):
        text = (
            "Conversation info (untrusted metadata):\n"
            "```json\n{}\n```\n"
            "[Mon 2026-03-10 09:13 PDT] Real message here"
        )
        result = SessionWatcher._extract_user_text(text)
        assert result == "Real message here"
