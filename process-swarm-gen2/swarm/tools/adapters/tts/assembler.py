"""TTS Assembler — concatenates chunk AIFF files into a single narration."""

from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsAssemblerAdapter(ToolAdapter):
    """Concatenates per-chunk AIFF files into a single narration file
    using ffmpeg's concat demuxer.

    Writes a concat list file and runs:
        ffmpeg -y -f concat -safe 0 -i <list> -c copy <output>
    """

    @property
    def tool_name(self) -> str:
        return "tts_assembler"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        renderer_data = ctx.prior_results.get("tts_renderer")
        if not isinstance(renderer_data, dict) or "chunk_files" not in renderer_data:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="Missing tts_renderer.chunk_files in prior_results",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        chunk_files = renderer_data["chunk_files"]
        if not chunk_files:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="No chunk files to assemble",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )

        output_dir = ctx.workspace_root / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "narration_final.aiff"

        # Build the concat list content
        concat_lines = []
        for path_str in chunk_files:
            # ffmpeg concat demuxer requires absolute or relative paths
            concat_lines.append(f"file '{path_str}'")
        concat_content = "\n".join(concat_lines) + "\n"

        tmp_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".txt",
                delete=False,
                encoding="utf-8",
            ) as tmp:
                tmp.write(concat_content)
                tmp_path = tmp.name

            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "concat",
                    "-safe", "0",
                    "-i", tmp_path,
                    "-c", "copy",
                    str(output_path),
                ],
                check=True,
                timeout=120,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as e:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error=f"ffmpeg concat failed: {e}",
                metadata={"duration_ms": (time.monotonic() - t0) * 1000},
            )
        finally:
            if tmp_path:
                try:
                    Path(tmp_path).unlink(missing_ok=True)
                except Exception:
                    pass

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data={
                "output_path": str(output_path),
                "chunk_count": len(chunk_files),
            },
            artifacts=[str(output_path)],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
