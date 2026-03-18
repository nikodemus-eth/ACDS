import json
from pathlib import Path
from swarm.openshell.models import CommandEnvelope, StageResult, CommandResult, now_utc
from swarm.openshell.config import OpenShellConfig

class ArtifactEmitter:
    """Writes per-stage artifacts and pipeline summary to disk."""

    def __init__(self, config: OpenShellConfig):
        self.config = config

    def emit(self, envelope: CommandEnvelope, stage_results: list[StageResult],
             execution_output: dict | None = None) -> list[str]:
        """Write stage artifacts and return list of artifact file paths."""
        if not self.config.emit_stage_artifacts:
            return []

        artifact_dir = Path(self.config.artifact_root) / envelope.envelope_id
        artifact_dir.mkdir(parents=True, exist_ok=True)

        paths = []
        for i, sr in enumerate(stage_results):
            filename = f"{i+1:02d}_{sr.stage_name}.json"
            path = artifact_dir / filename
            data = {
                "stage_name": sr.stage_name,
                "verdict": sr.verdict.value,
                "duration_ms": sr.duration_ms,
                "details": sr.details,
                "errors": sr.errors,
                "warnings": sr.warnings,
                "timestamp": now_utc(),
            }
            path.write_text(json.dumps(data, indent=2, default=str))
            paths.append(str(path))

        # Write execution output if present
        if execution_output is not None:
            exec_path = artifact_dir / "execution_output.json"
            exec_path.write_text(json.dumps(execution_output, indent=2, default=str))
            paths.append(str(exec_path))

        return paths

    def emit_summary(self, result: CommandResult, artifact_dir_path: str) -> str:
        """Write pipeline_result.json summary."""
        summary_path = Path(artifact_dir_path) / "pipeline_result.json"
        # Serialize CommandResult to dict
        data = {
            "result_id": result.result_id,
            "plan_id": result.plan_id,
            "envelope_id": result.envelope_id,
            "success": result.success,
            "output_data": result.output_data,
            "artifacts_produced": result.artifacts_produced,
            "error": result.error,
            "total_duration_ms": result.total_duration_ms,
            "stage_count": len(result.stage_results),
            "stages": [{"name": s.stage_name, "verdict": s.verdict.value, "duration_ms": s.duration_ms} for s in result.stage_results],
            "metadata": result.metadata,
        }
        summary_path.write_text(json.dumps(data, indent=2, default=str))
        return str(summary_path)
