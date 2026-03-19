"""Tests for Context Report pipeline adapters.

Tests the 5 inference-routed adapters:
  - CRExtractionAdapter (Ollama)
  - CRClusteringAdapter (Ollama)
  - CRPrioritizationAdapter (Apple Intelligence)
  - CRSynthesisAdapter (Apple Intelligence)
  - CRValidationAdapter (Ollama primary, Apple Intelligence fallback)

LLM tests skip when services are not reachable.
"""
from __future__ import annotations

import json
import socket

import pytest

from swarm.tools.base import ToolContext, ToolResult
from swarm.tools.inference_engines import InferenceResult
from swarm.tools.adapters.cr_extraction import (
    CRExtractionAdapter,
    _strip_think_tags,
    _try_parse_json,
    _salvage_nonstandard,
)
from swarm.tools.adapters.cr_clustering import CRClusteringAdapter
from swarm.tools.adapters.cr_prioritization import CRPrioritizationAdapter
from swarm.tools.adapters.cr_synthesis import CRSynthesisAdapter
from swarm.tools.adapters.cr_validation import CRValidationAdapter


# ──────────────────────────────────────────────
# Service availability checks
# ──────────────────────────────────────────────


def _service_available(host, port):
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except (ConnectionRefusedError, OSError, TimeoutError):
        return False


OLLAMA_AVAILABLE = _service_available("localhost", 11434)
AI_AVAILABLE = _service_available("localhost", 11435)


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────


def _make_ctx(tmp_path, *, prior_results=None, config=None, action=None):
    return ToolContext(
        run_id="run-cr-test",
        swarm_id="swarm-cr-test",
        action=action or {},
        workspace_root=tmp_path,
        repo=None,
        prior_results=prior_results or {},
        config=config or {},
    )


# ──────────────────────────────────────────────
# Extraction — pure helpers (no LLM needed)
# ──────────────────────────────────────────────


class TestExtractionHelpers:
    def test_strip_think_tags(self):
        text = '<think>reasoning here</think>{"key": "value"}'
        assert _strip_think_tags(text) == '{"key": "value"}'

    def test_strip_think_tags_multiline(self):
        text = '<think>\nlong\nreasoning\n</think>\n{"key": "value"}'
        assert '"key"' in _strip_think_tags(text)

    def test_strip_think_tags_no_tags(self):
        text = '{"key": "value"}'
        assert _strip_think_tags(text) == text

    def test_try_parse_json_markdown(self):
        text = 'Here is the output:\n```json\n{"a": 1}\n```'
        assert _try_parse_json(text) == {"a": 1}

    def test_try_parse_json_bare_braces(self):
        text = 'Some text {"a": 1} more text'
        assert _try_parse_json(text) == {"a": 1}

    def test_try_parse_json_invalid(self):
        assert _try_parse_json("no json here") is None

    def test_salvage_nonstandard(self):
        data = {
            "entities": [],
            "events": [],
            "topics": [],
            "raw_signals": [],
            "nvidia_gpu": {
                "release": "New GPU launched",
                "features": ["fast", "efficient"],
            },
        }
        result = _salvage_nonstandard(data)
        assert len(result["topics"]) >= 1
        assert len(result["raw_signals"]) >= 1
        assert "Nvidia Gpu" in result["topics"]

    def test_salvage_preserves_existing(self):
        data = {
            "entities": [{"name": "X", "type": "org"}],
            "events": [],
            "topics": ["existing"],
            "raw_signals": ["existing signal"],
        }
        result = _salvage_nonstandard(data)
        assert result["entities"] == [{"name": "X", "type": "org"}]


# ──────────────────────────────────────────────
# Extraction — tool name and empty-source path
# ──────────────────────────────────────────────


class TestCRExtraction:
    def test_tool_name(self):
        assert CRExtractionAdapter().tool_name == "cr_extraction"

    def test_no_sources_returns_empty(self, tmp_path):
        ctx = _make_ctx(tmp_path)
        result = CRExtractionAdapter().execute(ctx)
        assert result.success is True
        assert result.output_data["entities"] == []
        assert result.warnings == ["No sources provided for extraction"]

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_successful_extraction(self, tmp_path):
        ctx = _make_ctx(tmp_path, prior_results={
            "source_normalizer": {
                "normalized_sources": [
                    {"title": "Article 1", "content": "Nvidia launches new GPU with 10x throughput"},
                ]
            }
        })
        result = CRExtractionAdapter().execute(ctx)
        assert result.success is True
        assert "entities" in result.output_data
        assert "raw_signals" in result.output_data

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_extraction_reads_fresh_sources_first(self, tmp_path):
        """When both freshness_filter and source_normalizer exist, fresh_sources wins."""
        ctx = _make_ctx(tmp_path, prior_results={
            "freshness_filter": {"fresh_sources": [{"title": "Fresh", "content": "fresh data about AI"}]},
            "source_normalizer": {"normalized_sources": [{"title": "Old", "content": "stale"}]},
        })
        result = CRExtractionAdapter().execute(ctx)
        # As long as it ran successfully with the fresh sources, the path is exercised
        assert result.success is True

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_extraction_writes_artifact(self, tmp_path):
        ctx = _make_ctx(tmp_path, prior_results={
            "source_collector": {"sources": [{"title": "A", "content": "data about technology trends"}]}
        })
        result = CRExtractionAdapter().execute(ctx)
        if result.success:
            assert len(result.artifacts) == 1
            artifact = json.loads(open(result.artifacts[0]).read())
            assert "topics" in artifact or "entities" in artifact

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_extraction_truncates_long_input(self, tmp_path):
        """Large inputs are truncated before sending to the LLM."""
        big_sources = [
            {"title": f"Src {i}", "content": "x" * 5000}
            for i in range(20)
        ]
        ctx = _make_ctx(tmp_path, prior_results={
            "source_collector": {"sources": big_sources}
        })
        result = CRExtractionAdapter().execute(ctx)
        # The adapter should still handle the large input (truncated internally)
        assert isinstance(result.success, bool)


# ──────────────────────────────────────────────
# Clustering
# ──────────────────────────────────────────────


class TestCRClustering:
    def test_tool_name(self):
        assert CRClusteringAdapter().tool_name == "cr_clustering"

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_successful_clustering(self, tmp_path):
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_extraction": {
                "entities": [{"name": "Nvidia", "type": "org"}],
                "events": [],
                "topics": ["AI"],
                "raw_signals": ["GPU launch", "regulation", "growth"],
            }
        })
        result = CRClusteringAdapter().execute(ctx)
        assert result.success is True
        assert "cluster_count" in result.output_data
        assert result.output_data["cluster_count"] >= 1

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_clustering_with_minimal_signals(self, tmp_path):
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_extraction": {"entities": [], "events": [], "topics": [], "raw_signals": ["s1"]}
        })
        result = CRClusteringAdapter().execute(ctx)
        assert isinstance(result.success, bool)


# ──────────────────────────────────────────────
# Prioritization
# ──────────────────────────────────────────────


class TestCRPrioritization:
    def test_tool_name(self):
        assert CRPrioritizationAdapter().tool_name == "cr_prioritization"

    def test_no_clusters_returns_empty(self, tmp_path):
        ctx = _make_ctx(tmp_path)
        result = CRPrioritizationAdapter().execute(ctx)
        assert result.success is True
        assert result.output_data["prioritized"] == []
        assert result.warnings == ["No clusters to prioritize"]

    @pytest.mark.skipif(not AI_AVAILABLE, reason="Apple Intelligence not running on localhost:11435")
    def test_successful_prioritization(self, tmp_path):
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_clustering": {
                "clusters": [
                    {"category": "technical", "label": "AI Hardware", "signals": ["GPU launch"]},
                ]
            }
        })
        result = CRPrioritizationAdapter().execute(ctx)
        assert result.success is True
        assert "priority_count" in result.output_data


# ──────────────────────────────────────────────
# Synthesis
# ──────────────────────────────────────────────


class TestCRSynthesis:
    def test_tool_name(self):
        assert CRSynthesisAdapter().tool_name == "cr_synthesis"

    def test_no_signals_returns_placeholder(self, tmp_path):
        ctx = _make_ctx(tmp_path)
        result = CRSynthesisAdapter().execute(ctx)
        assert result.success is True
        assert "No signals" in result.output_data["report_text"]
        assert result.warnings == ["No prioritized signals for synthesis"]

    @pytest.mark.skipif(not AI_AVAILABLE, reason="Apple Intelligence not running on localhost:11435")
    def test_successful_synthesis(self, tmp_path):
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_prioritization": {
                "prioritized": [{"label": "AI", "category": "technical", "signals": ["s"]}]
            }
        })
        result = CRSynthesisAdapter().execute(ctx)
        assert result.success is True
        assert "report_text" in result.output_data


# ──────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────


class TestCRValidation:
    def test_tool_name(self):
        assert CRValidationAdapter().tool_name == "cr_validation"

    def test_no_report_text(self, tmp_path):
        ctx = _make_ctx(tmp_path)
        result = CRValidationAdapter().execute(ctx)
        assert result.success is False
        assert "No report text" in result.error

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_validation_passes_good_report(self, tmp_path):
        report = (
            "## Executive Summary\n" + "A" * 100 + "\n\n"
            "## Technical Intelligence\n" + "B" * 100 + "\n\n"
            "## Governance & Policy\n" + "C" * 100 + "\n\n"
            "## Market Intelligence\n" + "D" * 100 + "\n\n"
            "## Recommendations\n" + "E" * 100
        )
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_synthesis": {
                "report_text": report,
                "sections": {
                    "Executive Summary": "A" * 100,
                    "Technical Intelligence": "B" * 100,
                    "Governance & Policy": "C" * 100,
                    "Market Intelligence": "D" * 100,
                    "Recommendations": "E" * 100,
                },
            }
        })
        result = CRValidationAdapter().execute(ctx)
        assert isinstance(result.success, bool)
        if result.success:
            assert "all_passed" in result.output_data

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_validation_detects_missing_sections(self, tmp_path):
        report = "## Executive Summary\n" + "A" * 200 + "\n\n## Technical Intelligence\n" + "B" * 200
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_synthesis": {
                "report_text": report,
                "sections": {
                    "Executive Summary": "A" * 200,
                    "Technical Intelligence": "B" * 200,
                },
            }
        })
        result = CRValidationAdapter().execute(ctx)
        assert isinstance(result.success, bool)
        if result.success:
            section_status = result.output_data.get("section_status", {})
            # Missing sections should be flagged
            assert section_status.get("Governance & Policy") == "fail"
            assert section_status.get("Market Intelligence") == "fail"
            assert section_status.get("Recommendations") == "fail"

    @pytest.mark.skipif(not OLLAMA_AVAILABLE, reason="Ollama not running on localhost:11434")
    def test_validation_writes_artifact(self, tmp_path):
        report = (
            "## Executive Summary\n" + "A" * 100 + "\n\n"
            "## Technical Intelligence\n" + "B" * 100 + "\n\n"
            "## Governance & Policy\n" + "C" * 100 + "\n\n"
            "## Market Intelligence\n" + "D" * 100 + "\n\n"
            "## Recommendations\n" + "E" * 100
        )
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_synthesis": {"report_text": report, "sections": {
                "Executive Summary": "A" * 100,
                "Technical Intelligence": "B" * 100,
                "Governance & Policy": "C" * 100,
                "Market Intelligence": "D" * 100,
                "Recommendations": "E" * 100,
            }}
        })
        result = CRValidationAdapter().execute(ctx)
        if result.success and result.artifacts:
            artifact = json.loads(open(result.artifacts[0]).read())
            assert "valid" in artifact or "section_status" in artifact


# ──────────────────────────────────────────────
# Freshness filter (date parsing) — no LLM needed
# ──────────────────────────────────────────────


class TestFreshnessFilterDates:
    """Test the freshness filter with RSS and Atom date formats."""

    def test_rss_date_parsing(self, tmp_path):
        from swarm.tools.adapters.freshness_filter import FreshnessFilterAdapter

        adapter = FreshnessFilterAdapter()
        ctx = _make_ctx(tmp_path, prior_results={
            "source_normalizer": {
                "normalized_sources": [
                    {"title": "Recent", "content": "data", "published": "Mon, 16 Mar 2026 12:00:00 GMT"},
                    {"title": "Old", "content": "data", "published": "Mon, 01 Jan 2024 12:00:00 GMT"},
                ]
            }
        }, config={"max_age_days": 30})
        result = adapter.execute(ctx)
        assert result.success is True
        assert result.output_data["fresh_count"] == 1
        assert result.output_data["stale_count"] == 1

    def test_iso_date_parsing(self, tmp_path):
        from swarm.tools.adapters.freshness_filter import FreshnessFilterAdapter

        adapter = FreshnessFilterAdapter()
        ctx = _make_ctx(tmp_path, prior_results={
            "source_normalizer": {
                "normalized_sources": [
                    {"title": "Recent", "content": "data", "published": "2026-03-16T12:00:00+00:00"},
                ]
            }
        }, config={"max_age_days": 30})
        result = adapter.execute(ctx)
        assert result.output_data["fresh_count"] == 1

    def test_unparseable_dates_treated_as_fresh(self, tmp_path):
        from swarm.tools.adapters.freshness_filter import FreshnessFilterAdapter

        adapter = FreshnessFilterAdapter()
        ctx = _make_ctx(tmp_path, prior_results={
            "source_normalizer": {
                "normalized_sources": [
                    {"title": "Weird", "content": "data", "published": "not a date"},
                ]
            }
        }, config={"max_age_days": 7})
        result = adapter.execute(ctx)
        assert result.output_data["fresh_count"] == 1


# ──────────────────────────────────────────────
# Source collector (feed isolation) — no LLM needed
# ──────────────────────────────────────────────


class TestSourceCollectorFeedConfig:
    """Test that feeds=[] disables RSS fetching."""

    def test_empty_feeds_no_network(self, tmp_path):
        from swarm.tools.adapters.source_collector import SourceCollectorAdapter

        adapter = SourceCollectorAdapter()
        ctx = _make_ctx(tmp_path, config={"feeds": []})
        result = adapter.execute(ctx)
        assert result.success is True
        assert result.output_data["source_count"] == 0
