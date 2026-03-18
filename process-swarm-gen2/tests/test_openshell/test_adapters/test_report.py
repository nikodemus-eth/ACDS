"""Tests for swarm.openshell.adapters.report — ReportAdapter."""

from __future__ import annotations

from swarm.openshell.adapters.report import ReportAdapter
from swarm.openshell.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)


def _make_envelope(params: dict) -> CommandEnvelope:
    return CommandEnvelope(
        envelope_id=new_id("env"),
        command_name="report.render_markdown",
        version="v1",
        parameters=params,
        side_effect_level=SideEffectLevel.CONTROLLED_GENERATION,
        run_id="run-1",
        swarm_id="swarm-1",
        created_at=now_utc(),
    )


class TestReportAdapter:
    """Tests for report.render_markdown."""

    def test_render_basic_content(self, workspace):
        adapter = ReportAdapter()
        env = _make_envelope({
            "content": "Some markdown **bold**",
            "output_path": "report.md",
        })
        result = adapter.execute_command(env, workspace, {})
        written = (workspace / "report.md").read_text()
        assert "Some markdown **bold**" in written
        assert result["char_count"] == len(written)

    def test_render_with_title(self, workspace):
        adapter = ReportAdapter()
        env = _make_envelope({
            "content": "Body text here",
            "output_path": "titled.md",
            "title": "My Report",
        })
        result = adapter.execute_command(env, workspace, {})
        written = (workspace / "titled.md").read_text()
        assert written.startswith("# My Report\n\n")
        assert "Body text here" in written

    def test_render_without_title(self, workspace):
        adapter = ReportAdapter()
        env = _make_envelope({
            "content": "Just content",
            "output_path": "notitle.md",
        })
        adapter.execute_command(env, workspace, {})
        written = (workspace / "notitle.md").read_text()
        assert written == "Just content"

    def test_creates_parent_directories(self, workspace):
        adapter = ReportAdapter()
        env = _make_envelope({
            "content": "Nested report",
            "output_path": "reports/sub/output.md",
        })
        adapter.execute_command(env, workspace, {})
        assert (workspace / "reports" / "sub" / "output.md").read_text() == "Nested report"

    def test_result_contains_path(self, workspace):
        adapter = ReportAdapter()
        env = _make_envelope({
            "content": "x",
            "output_path": "r.md",
        })
        result = adapter.execute_command(env, workspace, {})
        assert "r.md" in result["path"]
