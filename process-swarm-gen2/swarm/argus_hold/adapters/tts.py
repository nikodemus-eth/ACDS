"""ARGUS-Hold TTS adapter — real audio synthesis via macOS say command."""

from __future__ import annotations

import hashlib
import subprocess
import tempfile
from pathlib import Path


class TtsAdapter:
    """TTS adapter that produces real audio using macOS say command.

    Requires /usr/bin/say (macOS built-in) and optionally ffmpeg for
    format conversion from AIFF to MP3/WAV.
    """

    def execute_command(self, envelope, workspace_root, prior_results) -> dict:
        params = envelope.parameters
        text = params.get("text", "")
        voice = params.get("voice_profile", "Samantha")
        fmt = params.get("format", "aiff")
        output_path = params.get("output_path", "")

        if not text:
            raise RuntimeError("tts.generate requires non-empty 'text' parameter")
        if not output_path:
            raise RuntimeError("tts.generate requires 'output_path' parameter")

        # Resolve output path relative to workspace
        full_output = Path(workspace_root) / output_path
        full_output.parent.mkdir(parents=True, exist_ok=True)

        # Write text to temp file to avoid shell injection
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False
        ) as tmp:
            tmp.write(text)
            tmp_path = tmp.name

        try:
            # Synthesize to AIFF first (say's native format)
            aiff_path = full_output.with_suffix(".aiff")
            subprocess.run(
                ["/usr/bin/say", "-v", voice, "-o", str(aiff_path), "-f", tmp_path],
                check=True,
                timeout=120,
                capture_output=True,
            )

            # Convert format if needed
            if fmt in ("mp3", "wav") and aiff_path.exists():
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", str(aiff_path),
                        str(full_output),
                    ],
                    check=True,
                    timeout=60,
                    capture_output=True,
                )
                aiff_path.unlink()  # Clean up intermediate AIFF
                result_path = full_output
            else:
                # AIFF is the final output
                if full_output.suffix != ".aiff":
                    aiff_path.rename(full_output.with_suffix(".aiff"))
                    result_path = full_output.with_suffix(".aiff")
                else:
                    result_path = aiff_path

            # Compute hash
            sha256 = hashlib.sha256(result_path.read_bytes()).hexdigest()

            return {
                "implemented": True,
                "output_path": str(result_path),
                "size_bytes": result_path.stat().st_size,
                "text_length": len(text),
                "voice_profile": voice,
                "format": fmt,
                "sha256": sha256,
            }
        finally:
            Path(tmp_path).unlink(missing_ok=True)
