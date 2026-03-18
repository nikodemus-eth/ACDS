"""Tests for swarm.argus_hold.adapters.tts — TtsAdapter."""

from __future__ import annotations

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
    """Tests for the stub TTS adapter."""

    def test_returns_not_implemented(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Hello world",
            "voice_profile": "default",
            "output_path": "output.mp3",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["implemented"] is False

    def test_text_length_reported(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "Test text with length",
            "voice_profile": "narrator",
            "output_path": "out.mp3",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["text_length"] == len("Test text with length")

    def test_voice_profile_forwarded(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "hello",
            "voice_profile": "custom_voice",
            "output_path": "out.mp3",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["voice_profile"] == "custom_voice"

    def test_format_default_mp3(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "hello",
            "voice_profile": "v1",
            "output_path": "out.mp3",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["format"] == "mp3"

    def test_format_wav(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "hello",
            "voice_profile": "v1",
            "output_path": "out.wav",
            "format": "wav",
        })
        result = adapter.execute_command(env, workspace, {})
        assert result["format"] == "wav"

    def test_message_present(self, workspace):
        adapter = TtsAdapter()
        env = _make_envelope({
            "text": "hi",
            "voice_profile": "v1",
            "output_path": "out.mp3",
        })
        result = adapter.execute_command(env, workspace, {})
        assert "not available" in result["message"]
