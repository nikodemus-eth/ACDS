"""TTS Audio Validator — verifies the assembled narration file."""

from __future__ import annotations

import hashlib
import re
import subprocess
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsAudioValidatorAdapter(ToolAdapter):
    """Validates the final narration audio file.

    Checks: file exists, size > 0, parses duration via afinfo,
    computes SHA-256 hash.
    """

    @property
    def tool_name(self) -> str:
        return "tts_audio_validator"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        assembler_data = ctx.prior_results.get("tts_assembler")
        if not isinstance(assembler_data, dict) or "output_path" not in assembler_data:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="Missing tts_assembler.output_path in prior_results",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        audio_path = Path(assembler_data["output_path"])

        # Check existence
        if not audio_path.exists():
            return ToolResult(
                success=False,
                output_data={"valid": False, "path": str(audio_path)},
                artifacts=[],
                error=f"Audio file does not exist: {audio_path}",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        # Check size
        size_bytes = audio_path.stat().st_size
        if size_bytes == 0:
            return ToolResult(
                success=False,
                output_data={"valid": False, "path": str(audio_path), "size_bytes": 0},
                artifacts=[],
                error="Audio file is empty (0 bytes)",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        # Get duration via afinfo
        duration_seconds = 0.0
        try:
            result = subprocess.run(
                ["afinfo", str(audio_path)],
                capture_output=True,
                text=True,
                timeout=15,
            )
            for line in result.stdout.splitlines():
                match = re.search(r"estimated duration:\s*([\d.]+)", line, re.IGNORECASE)
                if match:
                    duration_seconds = float(match.group(1))
                    break
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
            # afinfo failure is non-fatal for validation
            pass

        # Compute SHA-256
        sha256 = hashlib.sha256(audio_path.read_bytes()).hexdigest()

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "valid": True,
                "path": str(audio_path),
                "size_bytes": size_bytes,
                "duration_seconds": duration_seconds,
                "sha256": sha256,
            },
            artifacts=[str(audio_path)],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
