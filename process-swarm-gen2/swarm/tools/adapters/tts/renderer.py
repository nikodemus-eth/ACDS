"""TTS Renderer — invokes macOS `say` to produce AIFF audio per chunk."""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsRendererAdapter(ToolAdapter):
    """Renders each text chunk to AIFF audio using the macOS say command.

    For each chunk, writes the text to a temp file and calls:
        say -v <voice> -r <rate> -o <output_path> -f <temp_file>

    This avoids shell injection by never passing text through the shell.
    """

    @property
    def tool_name(self) -> str:
        return "tts_renderer"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        chunker_data = ctx.prior_results.get("tts_chunker")
        if not isinstance(chunker_data, dict) or "chunks" not in chunker_data:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="Missing tts_chunker.chunks in prior_results",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        chunks = chunker_data["chunks"]
        voice = ctx.config.get("voice", "Samantha")
        rate = ctx.config.get("rate", 175)

        tts_dir = ctx.workspace_root / "tts"
        tts_dir.mkdir(parents=True, exist_ok=True)

        chunk_files: list[str] = []

        for chunk in chunks:
            index = chunk["index"]
            text = chunk["text"]
            output_path = tts_dir / f"chunk_{index:03d}.aiff"

            try:
                # Write chunk text to a temp file to avoid shell injection
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    suffix=".txt",
                    delete=False,
                    encoding="utf-8",
                ) as tmp:
                    tmp.write(text)
                    tmp_path = tmp.name

                subprocess.run(
                    ["say", "-v", voice, "-r", str(rate), "-o", str(output_path), "-f", tmp_path],
                    check=True,
                    timeout=60,
                )

                chunk_files.append(str(output_path))

            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
                return ToolResult(
                    success=False,
                    output_data={"chunk_files": chunk_files, "failed_chunk": index},
                    artifacts=chunk_files,
                    error=f"say failed on chunk {index}: {e}",
                    metadata={"duration_ms": (time.monotonic() - t0) * 1000},
                )
            finally:
                # Clean up temp file
                try:
                    Path(tmp_path).unlink(missing_ok=True)
                except Exception:
                    pass

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "chunk_files": chunk_files,
                "voice": voice,
                "rate": rate,
                "chunk_count": len(chunk_files),
            },
            artifacts=chunk_files,
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
