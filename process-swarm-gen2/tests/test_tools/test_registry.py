"""Tests for AdapterRegistry."""

from __future__ import annotations

import pytest

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult
from swarm.tools.registry import AdapterRegistry


class StubAdapter(ToolAdapter):
    """Minimal adapter for testing registry."""

    def __init__(self, name: str):
        self._name = name

    @property
    def tool_name(self) -> str:
        return self._name

    def execute(self, ctx: ToolContext) -> ToolResult:
        return ToolResult(True, {"adapter": self._name}, [], None, {})


class TestAdapterRegistry:
    def test_empty_registry(self):
        reg = AdapterRegistry()
        assert reg.list_adapters() == []

    def test_register_and_get(self):
        reg = AdapterRegistry()
        adapter = StubAdapter("run_manager")
        reg.register(adapter)
        assert reg.get_adapter("run_manager") is adapter

    def test_has_adapter_true(self):
        reg = AdapterRegistry()
        reg.register(StubAdapter("run_manager"))
        assert reg.has_adapter("run_manager") is True

    def test_has_adapter_false(self):
        reg = AdapterRegistry()
        assert reg.has_adapter("nonexistent") is False

    def test_get_adapter_missing_returns_none(self):
        reg = AdapterRegistry()
        assert reg.get_adapter("nonexistent") is None

    def test_list_adapters_sorted(self):
        reg = AdapterRegistry()
        reg.register(StubAdapter("b"))
        reg.register(StubAdapter("a"))
        assert reg.list_adapters() == ["a", "b"]

    def test_register_duplicate_raises(self):
        reg = AdapterRegistry()
        reg.register(StubAdapter("a"))
        with pytest.raises(ValueError, match="already registered"):
            reg.register(StubAdapter("a"))

    def test_create_default_loads_all_adapters(self):
        reg = AdapterRegistry.create_default()
        names = reg.list_adapters()
        assert len(names) == 15
        expected = [
            "run_manager",
            "policy_loader",
            "source_collector",
            "url_validator",
            "freshness_filter",
            "source_normalizer",
            "bundle_builder",
            "section_mapper",
            "synthesis_brief_builder",
            "probabilistic_synthesis",
            "report_formatter",
            "rule_validator",
            "citation_validator",
            "decision_engine",
            "delivery_engine",
        ]
        for name in expected:
            assert name in names, f"Missing adapter: {name}"
