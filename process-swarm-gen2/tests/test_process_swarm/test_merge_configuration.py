from __future__ import annotations

from process_swarm.scripts.merge_job_configuration import merge_configuration


def test_extracted_scalar_overrides_default() -> None:
    defaults = {"execution_mode": "sequential", "source_scope": ["curated_sources"]}
    extracted = {
        "execution_mode": "parallel",
        "source_scope": [],
        "cadence": None,
    }
    merged = merge_configuration(defaults, extracted)
    assert merged["execution_mode"] == "parallel"


def test_empty_list_keeps_default() -> None:
    defaults = {"artifact_formats": ["markdown"]}
    extracted = {"artifact_formats": []}
    merged = merge_configuration(defaults, extracted)
    assert merged["artifact_formats"] == ["markdown"]


def test_nonempty_list_overrides_default() -> None:
    defaults = {"artifact_formats": ["markdown"]}
    extracted = {"artifact_formats": ["json", "csv"]}
    merged = merge_configuration(defaults, extracted)
    assert merged["artifact_formats"] == ["json", "csv"]


def test_none_scalar_keeps_default() -> None:
    defaults = {"execution_mode": "sequential"}
    extracted = {"execution_mode": None}
    merged = merge_configuration(defaults, extracted)
    assert merged["execution_mode"] == "sequential"


def test_keys_from_both_sides_present() -> None:
    defaults = {"a": "default_a"}
    extracted = {"b": "extracted_b"}
    merged = merge_configuration(defaults, extracted)
    assert merged["a"] == "default_a"
    assert merged["b"] == "extracted_b"
