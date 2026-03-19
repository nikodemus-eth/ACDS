"""TTS Artifact Registrar — writes a summary JSON of the full TTS pipeline run."""

from __future__ import annotations

import json
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult


class TtsArtifactRegistrarAdapter(ToolAdapter):
    """Gathers results from all prior TTS pipeline steps and writes a
    tts_result.json manifest to the workspace.
    """

    @property
    def tool_name(self) -> str:
        return "tts_artifact_registrar"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        resolver = ctx.prior_results.get("tts_artifact_resolver", {})
        renderer = ctx.prior_results.get("tts_renderer", {})
        assembler = ctx.prior_results.get("tts_assembler", {})
        validator = ctx.prior_results.get("tts_audio_validator", {})

        tts_result = {
            "source_report_path": resolver.get("report_path", ""),
            "audio_path": assembler.get("output_path", ""),
            "duration": validator.get("duration_seconds", 0.0),
            "chunk_count": renderer.get("chunk_count", 0),
            "voice": renderer.get("voice", ""),
            "rate": renderer.get("rate", 0),
            "sha256": validator.get("sha256", ""),
            "validation_status": "valid" if validator.get("valid") else "invalid",
        }

        result_path = ctx.workspace_root / "tts_result.json"
        result_path.write_text(json.dumps(tts_result, indent=2), encoding="utf-8")

        elapsed_ms = (time.monotonic() - t0) * 1000
        return ToolResult(
            success=True,
            output_data=tts_result,
            artifacts=["tts_result.json"],
            error=None,
            metadata={"duration_ms": elapsed_ms},
        )
