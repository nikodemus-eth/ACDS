"""Tests for swarm.openshell.artifact_emitter — ArtifactEmitter."""

from __future__ import annotations

import json
from pathlib import Path

from swarm.openshell.artifact_emitter import ArtifactEmitter
from swarm.openshell.config import OpenShellConfig
from swarm.openshell.models import (
    CommandEnvelope,
    CommandResult,
    SideEffectLevel,
    StageResult,
    StageVerdict,
    new_id,
    now_utc,
)


def _make_envelope() -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id="env-test-001",
        command_name="filesystem.read_file",
        version="v1",
        parameters={"path": "test.txt"},
        side_effect_level=SideEffectLevel.READ_ONLY,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


def _make_stage_results() -> list[StageResult]:
    return [
        StageResult(stage_name="normalize", verdict=StageVerdict.PASSED, duration_ms=1),
        StageResult(stage_name="validate", verdict=StageVerdict.PASSED, duration_ms=2),
    ]


class TestArtifactEmitterEmit:
    """Tests for ArtifactEmitter.emit()."""

    def test_emit_creates_stage_files(self, config):
        emitter = ArtifactEmitter(config)
        env = _make_envelope()
        stages = _make_stage_results()
        paths = emitter.emit(env, stages)
        assert len(paths) == 2
        for p in paths:
            assert Path(p).exists()

    def test_stage_file_naming(self, config):
        emitter = ArtifactEmitter(config)
        env = _make_envelope()
        stages = _make_stage_results()
        paths = emitter.emit(env, stages)
        names = [Path(p).name for p in paths]
        assert "01_normalize.json" in names
        assert "02_validate.json" in names

    def test_stage_file_content(self, config):
        emitter = ArtifactEmitter(config)
        env = _make_envelope()
        stages = _make_stage_results()
        paths = emitter.emit(env, stages)
        data = json.loads(Path(paths[0]).read_text())
        assert data["stage_name"] == "normalize"
        assert data["verdict"] == "passed"
        assert data["duration_ms"] == 1

    def test_emit_with_execution_output(self, config):
        emitter = ArtifactEmitter(config)
        env = _make_envelope()
        stages = _make_stage_results()
        exec_output = {"content": "file contents", "size": 42}
        paths = emitter.emit(env, stages, execution_output=exec_output)
        # Should have 2 stage files + 1 execution_output
        assert len(paths) == 3
        exec_path = [p for p in paths if "execution_output" in p][0]
        data = json.loads(Path(exec_path).read_text())
        assert data["content"] == "file contents"

    def test_emit_disabled(self, config):
        config.emit_stage_artifacts = False
        emitter = ArtifactEmitter(config)
        env = _make_envelope()
        paths = emitter.emit(env, _make_stage_results())
        assert paths == []

    def test_artifacts_under_envelope_id_dir(self, config):
        emitter = ArtifactEmitter(config)
        env = _make_envelope()
        paths = emitter.emit(env, _make_stage_results())
        for p in paths:
            assert env.envelope_id in p


class TestArtifactEmitterSummary:
    """Tests for ArtifactEmitter.emit_summary()."""

    def test_emit_summary_creates_file(self, config, tmp_path):
        emitter = ArtifactEmitter(config)
        result = CommandResult(
            result_id="res-1",
            plan_id="plan-1",
            envelope_id="env-1",
            success=True,
            output_data={"key": "value"},
            artifacts_produced=["a.json"],
            error=None,
            stage_results=_make_stage_results(),
            total_duration_ms=100,
        )
        summary_dir = tmp_path / "summary"
        summary_dir.mkdir()
        path = emitter.emit_summary(result, str(summary_dir))
        assert Path(path).exists()
        data = json.loads(Path(path).read_text())
        assert data["result_id"] == "res-1"
        assert data["success"] is True
        assert data["stage_count"] == 2

    def test_summary_contains_stages(self, config, tmp_path):
        emitter = ArtifactEmitter(config)
        result = CommandResult(
            result_id="res-2",
            plan_id="plan-2",
            envelope_id="env-2",
            success=True,
            output_data={},
            artifacts_produced=[],
            error=None,
            stage_results=_make_stage_results(),
            total_duration_ms=50,
        )
        summary_dir = tmp_path / "summary2"
        summary_dir.mkdir()
        path = emitter.emit_summary(result, str(summary_dir))
        data = json.loads(Path(path).read_text())
        assert len(data["stages"]) == 2
        assert data["stages"][0]["name"] == "normalize"
