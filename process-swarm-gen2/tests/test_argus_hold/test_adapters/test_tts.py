"""Tests for swarm.argus_hold.adapters.tts — real TTS via macOS say command.

All tests produce real audio files. No mocks, no stubs.
"""

from __future__ import annotations

from pathlib import Path

from swarm.argus_hold.adapters.tts import TtsAdapter
from swarm.argus_hold.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)


def _make_envelope(params: dict) -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="tts.generate",
        version="v1",
        parameters=params,
        side_effect_level=SideEffectLevel.CONTROLLED_GENERATION,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


class TestTtsAdapter:
    """Tests for the real TTS adapter using macOS say command."""

    def test_produces_real_audio(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Hello world. This is a test.",
            "voice_profile": "Samantha",
            "output_path": "test_output.aiff",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["implemented"] is True
        assert result["size_bytes"] > 0
        assert Path(result["output_path"]).exists()

    def test_text_length_reported(self, workspace):
        text = "Test text with measured length"
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": text,
            "voice_profile": "Samantha",
            "output_path": "length_test.aiff",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["text_length"] == len(text)

    def test_voice_profile_forwarded(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Voice test.",
            "voice_profile": "Daniel",
            "output_path": "voice_test.aiff",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["voice_profile"] == "Daniel"
        assert result["size_bytes"] > 0

    def test_sha256_hash_computed(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Hash verification test.",
            "voice_profile": "Samantha",
            "output_path": "hash_test.aiff",
        })
        result = adapter.execute_command(env, workspace, {})
        assert len(result["sha256"]) == 64  # SHA-256 hex digest
        assert all(c in "0123456789abcdef" for c in result["sha256"])

    def test_empty_text_raises(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "",
            "voice_profile": "Samantha",
            "output_path": "empty.aiff",
        })
        try:
            adapter.execute_command(env, workspace, {})
            assert False, "Should have raised RuntimeError"
        except RuntimeError as e:
            assert "non-empty" in str(e)

    def test_missing_output_path_raises(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Some text.",
            "voice_profile": "Samantha",
        })
        try:
            adapter.execute_command(env, workspace, {})
            assert False, "Should have raised RuntimeError"
        except RuntimeError as e:
            assert "output_path" in str(e)

    def test_creates_subdirectory(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Subdirectory test.",
            "voice_profile": "Samantha",
            "output_path": "nested/dir/output.aiff",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["implemented"] is True
        assert Path(result["output_path"]).exists()
