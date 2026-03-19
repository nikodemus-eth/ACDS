"""Tests for tool adapters.

All tests use real objects — real in-memory SQLite database, real file I/O.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from swarm.tools.base import ToolContext, ToolResult
from swarm.tools.adapters.run_manager import RunManagerAdapter
from swarm.tools.adapters.policy_loader import PolicyLoaderAdapter
from swarm.tools.adapters.source_collector import SourceCollectorAdapter
from swarm.tools.adapters.url_validator import UrlValidatorAdapter
from swarm.tools.adapters.freshness_filter import FreshnessFilterAdapter
from swarm.tools.adapters.source_normalizer import SourceNormalizerAdapter
from swarm.tools.adapters.section_mapper import SectionMapperAdapter
from swarm.tools.adapters.report_formatter import ReportFormatterAdapter
from swarm.tools.adapters.bundle_builder import BundleBuilderAdapter
from swarm.tools.adapters.citation_validator import CitationValidatorAdapter
from swarm.tools.adapters.rule_validator import RuleValidatorAdapter
from swarm.tools.adapters.decision_engine import DecisionEngineAdapter
from swarm.tools.adapters.delivery_engine import DeliveryEngineAdapter
from swarm.registry.database import RegistryDatabase
from swarm.registry.repository import SwarmRepository


@pytest.fixture
def repo():
    db = RegistryDatabase(":memory:")
    db.connect()
    db.migrate()
    return SwarmRepository(db)


def _make_ctx(tmp_path, repo, prior_results=None, config=None):
    return ToolContext(
        run_id="run-001",
        swarm_id="swarm-001",
        action={"action_id": "act-001"},
        workspace_root=tmp_path,
        repo=repo,
        prior_results=prior_results or {},
        config=config or {},
    )


# ──────────────────────────────────────────────
# RunManager
# ──────────────────────────────────────────────


class TestRunManager:
    def test_creates_workspace_dirs(self, tmp_path, repo):
        adapter = RunManagerAdapter()
        assert adapter.tool_name == "run_manager"
        result = adapter.execute(_make_ctx(tmp_path, repo))
        assert result.success
        assert (tmp_path / "sources").is_dir()
        assert (tmp_path / "output").is_dir()
        assert (tmp_path / "artifacts").is_dir()

    def test_writes_manifest(self, tmp_path, repo):
        adapter = RunManagerAdapter()
        result = adapter.execute(_make_ctx(tmp_path, repo))
        manifest = tmp_path / "artifacts" / "run_manifest.json"
        assert manifest.exists()
        data = json.loads(manifest.read_text())
        assert data["run_id"] == "run-001"
        assert data["swarm_id"] == "swarm-001"

    def test_returns_duration(self, tmp_path, repo):
        adapter = RunManagerAdapter()
        result = adapter.execute(_make_ctx(tmp_path, repo))
        assert "duration_ms" in result.metadata


# ──────────────────────────────────────────────
# PolicyLoader
# ──────────────────────────────────────────────


class TestPolicyLoader:
    def test_loads_policy_file(self, tmp_path, repo):
        policies_dir = tmp_path / "policies"
        policies_dir.mkdir()
        policy = {"name": "test_policy", "rules": []}
        (policies_dir / "swarm_policy.json").write_text(json.dumps(policy))

        adapter = PolicyLoaderAdapter()
        assert adapter.tool_name == "policy_loader"
        result = adapter.execute(_make_ctx(tmp_path, repo))
        assert result.success
        assert result.output_data["policy"]["name"] == "test_policy"

    def test_handles_missing_policy(self, tmp_path, repo):
        adapter = PolicyLoaderAdapter()
        result = adapter.execute(_make_ctx(tmp_path, repo))
        assert result.success
        assert result.output_data["policy"] == {}


# ──────────────────────────────────────────────
# SourceCollector
# ──────────────────────────────────────────────


class TestSourceCollector:
    def test_collects_from_mock_fixtures(self, tmp_path, repo):
        fixtures_dir = tmp_path / "fixtures"
        fixtures_dir.mkdir()
        mock_sources = {
            "sources": [
                {
                    "url": "http://example.com/1",
                    "title": "Source 1",
                    "content": "Content 1",
                    "category_id": "cat1",
                    "published_date": "2026-01-01",
                }
            ]
        }
        (fixtures_dir / "mock_sources.json").write_text(json.dumps(mock_sources))
        (tmp_path / "sources").mkdir()

        adapter = SourceCollectorAdapter()
        assert adapter.tool_name == "source_collector"
        result = adapter.execute(_make_ctx(tmp_path, repo, config={"feeds": []}))
        assert result.success
        assert result.output_data["source_count"] >= 1

    def test_empty_collection(self, tmp_path, repo):
        (tmp_path / "sources").mkdir()
        adapter = SourceCollectorAdapter()
        result = adapter.execute(_make_ctx(tmp_path, repo, config={"feeds": []}))
        assert result.success
        assert result.output_data["source_count"] == 0


# ──────────────────────────────────────────────
# UrlValidator
# ──────────────────────────────────────────────


class TestUrlValidator:
    def test_validates_http_urls(self, tmp_path, repo):
        adapter = UrlValidatorAdapter()
        assert adapter.tool_name == "url_validator"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "sources": {
                "sources": [
                    {"url": "https://example.com", "title": "Valid"},
                    {"url": "ftp://evil.com", "title": "Invalid"},
                ]
            }
        })
        result = adapter.execute(ctx)
        assert result.success
        assert result.output_data["valid_count"] >= 1
        assert result.output_data["invalid_count"] >= 1


# ──────────────────────────────────────────────
# FreshnessFilter
# ──────────────────────────────────────────────


class TestFreshnessFilter:
    def test_filters_by_freshness(self, tmp_path, repo):
        adapter = FreshnessFilterAdapter()
        assert adapter.tool_name == "freshness_filter"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "sources": {
                "sources": [
                    {"url": "http://example.com", "title": "Recent",
                     "published_date": "2026-03-14T00:00:00Z"},
                    {"url": "http://old.com", "title": "Old",
                     "published_date": "2020-01-01T00:00:00Z"},
                ]
            }
        })
        result = adapter.execute(ctx)
        assert result.success


# ──────────────────────────────────────────────
# SourceNormalizer
# ──────────────────────────────────────────────


class TestSourceNormalizer:
    def test_normalizes_content(self, tmp_path, repo):
        adapter = SourceNormalizerAdapter()
        assert adapter.tool_name == "source_normalizer"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "sources": {
                "sources": [
                    {"url": "http://example.com", "title": "Test",
                     "content": "<p>Hello <b>World</b></p>"},
                ]
            }
        })
        result = adapter.execute(ctx)
        assert result.success
        assert result.output_data["normalized_count"] >= 1


# ──────────────────────────────────────────────
# SectionMapper
# ──────────────────────────────────────────────


class TestSectionMapper:
    def test_maps_sources_to_sections(self, tmp_path, repo):
        adapter = SectionMapperAdapter()
        assert adapter.tool_name == "section_mapper"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "sources": {
                "sources": [
                    {"url": "http://example.com", "title": "Test",
                     "content": "Content", "category_id": "analysis"},
                ]
            }
        })
        result = adapter.execute(ctx)
        assert result.success
        assert "sections" in result.output_data


# ──────────────────────────────────────────────
# ReportFormatter
# ──────────────────────────────────────────────


class TestReportFormatter:
    def test_formats_report(self, tmp_path, repo):
        (tmp_path / "output").mkdir()
        adapter = ReportFormatterAdapter()
        assert adapter.tool_name == "report_formatter"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "synthesis": {
                "sections": [
                    {"title": "Introduction", "content": "Intro text"},
                    {"title": "Analysis", "content": "Analysis text"},
                ]
            }
        })
        result = adapter.execute(ctx)
        assert result.success
        assert len(result.artifacts) >= 1


# ──────────────────────────────────────────────
# BundleBuilder
# ──────────────────────────────────────────────


class TestBundleBuilder:
    def test_builds_bundle(self, tmp_path, repo):
        (tmp_path / "output").mkdir()
        report = tmp_path / "output" / "report.md"
        report.write_text("# Report\n\nContent here")
        adapter = BundleBuilderAdapter()
        assert adapter.tool_name == "bundle_builder"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "report": {"report_path": str(report)}
        })
        result = adapter.execute(ctx)
        assert result.success


# ──────────────────────────────────────────────
# CitationValidator
# ──────────────────────────────────────────────


class TestCitationValidator:
    def test_validates_citations(self, tmp_path, repo):
        adapter = CitationValidatorAdapter()
        assert adapter.tool_name == "citation_validator"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "report": {"content": "According to [1], this is true."},
            "sources": {
                "sources": [
                    {"url": "http://example.com", "title": "Source 1"}
                ]
            },
        })
        result = adapter.execute(ctx)
        assert result.success


# ──────────────────────────────────────────────
# RuleValidator
# ──────────────────────────────────────────────


class TestRuleValidator:
    def test_validates_rules(self, tmp_path, repo):
        adapter = RuleValidatorAdapter()
        assert adapter.tool_name == "rule_validator"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "report": {"content": "Report content with sufficient words " * 50}
        })
        result = adapter.execute(ctx)
        assert result.success


# ──────────────────────────────────────────────
# DecisionEngine
# ──────────────────────────────────────────────


class TestDecisionEngine:
    def test_go_decision(self, tmp_path, repo):
        adapter = DecisionEngineAdapter()
        assert adapter.tool_name == "decision_engine"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "validation": {"all_passed": True, "issues": []},
        })
        result = adapter.execute(ctx)
        assert result.success
        assert result.output_data["decision"] == "go"

    def test_no_go_decision(self, tmp_path, repo):
        adapter = DecisionEngineAdapter()
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "validation": {"all_passed": False, "issues": ["missing citations"]},
        })
        result = adapter.execute(ctx)
        assert result.success
        assert result.output_data["decision"] == "no_go"


# ──────────────────────────────────────────────
# DeliveryEngine adapter
# ──────────────────────────────────────────────


class TestDeliveryEngineAdapter:
    def test_triggers_delivery(self, tmp_path, repo):
        adapter = DeliveryEngineAdapter()
        assert adapter.tool_name == "delivery_engine"
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "decision": {"decision": "go"},
            "bundle": {"bundle_path": "/tmp/bundle"},
        })
        result = adapter.execute(ctx)
        assert result.success
        assert result.output_data["delivery_triggered"] is True

    def test_skips_on_no_go(self, tmp_path, repo):
        adapter = DeliveryEngineAdapter()
        ctx = _make_ctx(tmp_path, repo, prior_results={
            "decision": {"decision": "no_go"},
        })
        result = adapter.execute(ctx)
        assert result.success
        assert result.output_data["delivery_triggered"] is False
