"""Tests for Context Report pipeline adapters.

Tests the 5 inference-routed adapters:
  - CRExtractionAdapter (Ollama)
  - CRClusteringAdapter (Ollama)
  - CRPrioritizationAdapter (Apple Intelligence)
  - CRSynthesisAdapter (Apple Intelligence)
  - CRValidationAdapter (Ollama primary, Apple Intelligence fallback)

All LLM calls are mocked to avoid network dependencies.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

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


def _make_ctx(tmp_path, *, prior_results=None, config=None, action=None):
    return ToolContext(
        run_id="run-cr-test",
        swarm_id="swarm-cr-test",
        action=action or {},
        workspace_root=tmp_path,
        repo=MagicMock(),
        prior_results=prior_results or {},
        config=config or {},
    )


def _ok_result(output: str, engine: str = "ollama", model: str = "qwen3:8b") -> InferenceResult:
    return InferenceResult(
        success=True, output=output, engine=engine, model=model, latency_ms=100,
    )


def _fail_result(engine: str = "ollama") -> InferenceResult:
    return InferenceResult(
        success=False, output="", engine=engine, model="", latency_ms=50, error="timeout",
    )


# ──────────────────────────────────────────────
# Extraction
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

    @patch("swarm.tools.adapters.cr_extraction.OllamaClient")
    def test_successful_extraction(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        extraction_json = json.dumps({
            "entities": [{"name": "Nvidia", "type": "org"}],
            "events": [{"description": "GPU launch", "date": "2026-03"}],
            "topics": ["AI hardware"],
            "raw_signals": ["10x throughput improvement"],
        })
        mock_client.generate.return_value = _ok_result(extraction_json)

        ctx = _make_ctx(tmp_path, prior_results={
            "source_normalizer": {
                "normalized_sources": [
                    {"title": "Article 1", "content": "Nvidia launches new GPU"},
                ]
            }
        })
        result = CRExtractionAdapter().execute(ctx)
        assert result.success is True
        assert len(result.output_data["entities"]) == 1
        assert result.output_data["entities"][0]["name"] == "Nvidia"
        assert len(result.output_data["raw_signals"]) == 1

    @patch("swarm.tools.adapters.cr_extraction.OllamaClient")
    def test_extraction_reads_fresh_sources_first(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "entities": [], "events": [], "topics": ["test"], "raw_signals": [],
        }))

        ctx = _make_ctx(tmp_path, prior_results={
            "freshness_filter": {"fresh_sources": [{"title": "Fresh", "content": "data"}]},
            "source_normalizer": {"normalized_sources": [{"title": "Old", "content": "stale"}]},
        })
        CRExtractionAdapter().execute(ctx)
        call_args = mock_client.generate.call_args
        assert "Fresh" in call_args[0][0]

    @patch("swarm.tools.adapters.cr_extraction.OllamaClient")
    def test_extraction_failure(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _fail_result()

        ctx = _make_ctx(tmp_path, prior_results={
            "source_collector": {"sources": [{"title": "A", "content": "data"}]}
        })
        result = CRExtractionAdapter().execute(ctx)
        assert result.success is False
        assert "failed" in result.error.lower()

    @patch("swarm.tools.adapters.cr_extraction.OllamaClient")
    def test_extraction_truncates_long_input(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "entities": [], "events": [], "topics": [], "raw_signals": ["sig"],
        }))

        big_sources = [
            {"title": f"Src {i}", "content": "x" * 5000}
            for i in range(20)
        ]
        ctx = _make_ctx(tmp_path, prior_results={
            "source_collector": {"sources": big_sources}
        })
        CRExtractionAdapter().execute(ctx)
        prompt = mock_client.generate.call_args[0][0]
        assert len(prompt) < 20000

    @patch("swarm.tools.adapters.cr_extraction.OllamaClient")
    def test_extraction_writes_artifact(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "entities": [], "events": [], "topics": ["AI"], "raw_signals": [],
        }))

        ctx = _make_ctx(tmp_path, prior_results={
            "source_collector": {"sources": [{"title": "A", "content": "data"}]}
        })
        result = CRExtractionAdapter().execute(ctx)
        assert len(result.artifacts) == 1
        artifact = json.loads(open(result.artifacts[0]).read())
        assert "topics" in artifact


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
        # Should not be called when standard keys have data,
        # but if called, should return the existing data
        result = _salvage_nonstandard(data)
        assert result["entities"] == [{"name": "X", "type": "org"}]


# ──────────────────────────────────────────────
# Clustering
# ──────────────────────────────────────────────


class TestCRClustering:
    def test_tool_name(self):
        assert CRClusteringAdapter().tool_name == "cr_clustering"

    @patch("swarm.tools.adapters.cr_clustering.OllamaClient")
    def test_successful_clustering(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        clusters_json = json.dumps({
            "clusters": [
                {"category": "technical", "label": "AI Hardware", "signals": ["GPU launch"], "entity_refs": ["Nvidia"]},
                {"category": "governance", "label": "AI Ethics", "signals": ["regulation"], "entity_refs": []},
                {"category": "market", "label": "AI Market", "signals": ["growth"], "entity_refs": []},
            ]
        })
        mock_client.generate.return_value = _ok_result(clusters_json)

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
        assert result.output_data["cluster_count"] == 3
        assert result.output_data["category_counts"]["technical"] == 1
        assert result.output_data["category_counts"]["governance"] == 1
        assert result.output_data["category_counts"]["market"] == 1

    @patch("swarm.tools.adapters.cr_clustering.OllamaClient")
    def test_clustering_invalid_category_normalized(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "clusters": [
                {"category": "unknown", "label": "X", "signals": ["s1"], "entity_refs": []},
            ]
        }))
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_extraction": {"entities": [], "events": [], "topics": [], "raw_signals": ["s1"]}
        })
        result = CRClusteringAdapter().execute(ctx)
        assert result.output_data["clusters"][0]["category"] == "technical"

    @patch("swarm.tools.adapters.cr_clustering.OllamaClient")
    def test_clustering_failure(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _fail_result()

        ctx = _make_ctx(tmp_path, prior_results={
            "cr_extraction": {"entities": [], "events": [], "topics": ["AI"], "raw_signals": ["sig"]}
        })
        result = CRClusteringAdapter().execute(ctx)
        assert result.success is False

    @patch("swarm.tools.adapters.cr_clustering.OllamaClient")
    def test_clustering_strips_think_tags(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        output = '<think>reasoning</think>' + json.dumps({
            "clusters": [{"category": "technical", "label": "A", "signals": ["s"], "entity_refs": []}]
        })
        mock_client.generate.return_value = _ok_result(output)

        ctx = _make_ctx(tmp_path, prior_results={
            "cr_extraction": {"entities": [], "events": [], "topics": [], "raw_signals": ["s"]}
        })
        result = CRClusteringAdapter().execute(ctx)
        assert result.success is True
        assert result.output_data["cluster_count"] == 1


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

    @patch("swarm.tools.adapters.cr_prioritization.AppleIntelligenceClient")
    def test_successful_prioritization(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        prioritized_json = json.dumps({
            "prioritized": [
                {
                    "label": "AI Hardware",
                    "category": "technical",
                    "impact": 5, "novelty": 4, "relevance": 4,
                    "composite_score": 4.33,
                    "rationale": "Major hardware advancement",
                    "signals": ["GPU launch"],
                },
            ]
        })
        mock_client.generate.return_value = _ok_result(
            prioritized_json, engine="apple_intelligence", model="apple-fm-on-device",
        )

        ctx = _make_ctx(tmp_path, prior_results={
            "cr_clustering": {
                "clusters": [
                    {"category": "technical", "label": "AI Hardware", "signals": ["GPU launch"]},
                ]
            }
        })
        result = CRPrioritizationAdapter().execute(ctx)
        assert result.success is True
        assert result.output_data["priority_count"] == 1
        assert result.output_data["top_score"] == 4.33
        assert result.output_data["engine"] == "apple_intelligence"

    @patch("swarm.tools.adapters.cr_prioritization.AppleIntelligenceClient")
    def test_prioritization_computes_missing_score(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        mock_client.generate.return_value = _ok_result(
            json.dumps({"prioritized": [
                {"label": "X", "category": "market", "impact": 4, "novelty": 2, "relevance": 3,
                 "rationale": "test", "signals": ["s"]},
            ]}),
            engine="apple_intelligence", model="apple-fm-on-device",
        )
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_clustering": {"clusters": [{"category": "market", "label": "X", "signals": ["s"]}]}
        })
        result = CRPrioritizationAdapter().execute(ctx)
        item = result.output_data["prioritized"][0]
        assert item["composite_score"] == 3.0

    @patch("swarm.tools.adapters.cr_prioritization.AppleIntelligenceClient")
    def test_prioritization_retry_on_failure(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        mock_client.generate.side_effect = [
            _fail_result("apple_intelligence"),
            _fail_result("apple_intelligence"),
        ]
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_clustering": {"clusters": [{"category": "technical", "signals": ["s"]}]}
        })
        result = CRPrioritizationAdapter().execute(ctx)
        assert result.success is False
        assert "retry" in result.error.lower()
        assert mock_client.generate.call_count == 2


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

    @patch("swarm.tools.adapters.cr_synthesis.AppleIntelligenceClient")
    def test_successful_synthesis(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        report = (
            "## Executive Summary\nKey takeaways here.\n\n"
            "## Technical Intelligence\nTechnical analysis.\n\n"
            "## Governance & Policy\nPolicy implications.\n\n"
            "## Market Intelligence\nMarket trends.\n\n"
            "## Recommendations\nAction items."
        )
        mock_client.generate.return_value = _ok_result(
            report, engine="apple_intelligence", model="apple-fm-on-device",
        )

        ctx = _make_ctx(tmp_path, prior_results={
            "cr_prioritization": {
                "prioritized": [{"label": "AI", "category": "technical", "signals": ["s"]}]
            }
        })
        result = CRSynthesisAdapter().execute(ctx)
        assert result.success is True
        assert result.output_data["section_count"] == 5
        assert result.output_data["engine"] == "apple_intelligence"
        assert len(result.artifacts) == 2

    @patch("swarm.tools.adapters.cr_synthesis.AppleIntelligenceClient")
    def test_synthesis_retry_on_failure(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        mock_client.generate.side_effect = [
            _fail_result("apple_intelligence"),
            _fail_result("apple_intelligence"),
        ]
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_prioritization": {"prioritized": [{"label": "A", "signals": ["s"]}]}
        })
        result = CRSynthesisAdapter().execute(ctx)
        assert result.success is False
        assert "retry" in result.error.lower()

    @patch("swarm.tools.adapters.cr_synthesis.AppleIntelligenceClient")
    def test_synthesis_parses_sections(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        report = "## Summary\nContent A\n\n## Details\nContent B"
        mock_client.generate.return_value = _ok_result(
            report, engine="apple_intelligence", model="apple-fm-on-device",
        )
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_prioritization": {"prioritized": [{"label": "X", "signals": ["s"]}]}
        })
        result = CRSynthesisAdapter().execute(ctx)
        sections = result.output_data["sections"]
        assert "Summary" in sections
        assert "Details" in sections

    @patch("swarm.tools.adapters.cr_synthesis.AppleIntelligenceClient")
    def test_synthesis_no_sections_puts_under_report(self, MockApple, tmp_path):
        mock_client = MockApple.return_value
        mock_client.generate.return_value = _ok_result(
            "Plain text report with no section headers.",
            engine="apple_intelligence", model="apple-fm-on-device",
        )
        ctx = _make_ctx(tmp_path, prior_results={
            "cr_prioritization": {"prioritized": [{"label": "X", "signals": ["s"]}]}
        })
        result = CRSynthesisAdapter().execute(ctx)
        assert "Report" in result.output_data["sections"]


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

    @patch("swarm.tools.adapters.cr_validation.OllamaClient")
    def test_validation_passes_good_report(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "valid": True,
            "issues": [],
            "section_status": {
                "Executive Summary": "pass",
                "Technical Intelligence": "pass",
                "Governance & Policy": "pass",
                "Market Intelligence": "pass",
                "Recommendations": "pass",
            },
        }))

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
        assert result.success is True
        assert result.output_data["all_passed"] is True
        assert result.output_data["fallback_used"] is False

    @patch("swarm.tools.adapters.cr_validation.AppleIntelligenceClient")
    @patch("swarm.tools.adapters.cr_validation.OllamaClient")
    def test_validation_triggers_fallback_on_short_report(self, MockOllama, MockApple, tmp_path):
        mock_ollama = MockOllama.return_value
        mock_ollama.generate.return_value = _ok_result(json.dumps({
            "valid": False, "issues": ["Too short"], "section_status": {},
        }))

        mock_apple = MockApple.return_value
        refined = (
            "## Executive Summary\n" + "X" * 100 + "\n\n"
            "## Technical Intelligence\n" + "Y" * 100 + "\n\n"
            "## Governance & Policy\n" + "Z" * 100 + "\n\n"
            "## Market Intelligence\n" + "W" * 100 + "\n\n"
            "## Recommendations\n" + "V" * 100
        )
        mock_apple.generate.return_value = _ok_result(
            refined, engine="apple_intelligence", model="apple-fm-on-device",
        )

        ctx = _make_ctx(tmp_path, prior_results={
            "cr_synthesis": {
                "report_text": "Short report",
                "sections": {},
            }
        })
        result = CRValidationAdapter().execute(ctx)
        assert result.success is True
        assert result.output_data["fallback_used"] is True
        assert result.output_data["engine_fallback"] == "apple_intelligence"

    @patch("swarm.tools.adapters.cr_validation.OllamaClient")
    def test_validation_detects_missing_sections(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "valid": False, "issues": [], "section_status": {},
        }))

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
        section_status = result.output_data["section_status"]
        assert section_status.get("Governance & Policy") == "fail"
        assert section_status.get("Market Intelligence") == "fail"
        assert section_status.get("Recommendations") == "fail"

    @patch("swarm.tools.adapters.cr_validation.OllamaClient")
    def test_validation_writes_artifact(self, MockOllama, tmp_path):
        mock_client = MockOllama.return_value
        mock_client.generate.return_value = _ok_result(json.dumps({
            "valid": True, "issues": [], "section_status": {},
        }))

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
        assert len(result.artifacts) >= 1
        artifact = json.loads(open(result.artifacts[0]).read())
        assert "valid" in artifact


# ──────────────────────────────────────────────
# Freshness filter (date parsing)
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
# Source collector (feed isolation)
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
