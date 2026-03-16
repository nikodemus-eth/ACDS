from __future__ import annotations

"""Map suite IDs to diagnostic test descriptors."""

from grits.diagnostics import smoke, regression, drift, redteam


def _build_descriptor(
    test_id: str, suite_id: str, callable_fn: object, category: str,
) -> dict:
    """Create a test descriptor dictionary."""
    return {
        "test_id": test_id,
        "suite_id": suite_id,
        "callable": callable_fn,
        "category": category,
    }


_SUITE_REGISTRY: dict[str, list[dict]] = {
    "smoke": [
        _build_descriptor("smoke_schemas_exist", "smoke", smoke.test_schemas_exist, "health"),
        _build_descriptor("smoke_schemas_valid_json", "smoke", smoke.test_schemas_valid_json, "health"),
        _build_descriptor("smoke_adapters_importable", "smoke", smoke.test_adapters_importable, "health"),
        _build_descriptor("smoke_adapter_count", "smoke", smoke.test_adapter_count, "health"),
        _build_descriptor("smoke_key_files_exist", "smoke", smoke.test_key_files_exist, "health"),
        _build_descriptor("smoke_database_accessible", "smoke", smoke.test_database_accessible, "health"),
    ],
    "regression": [
        _build_descriptor("regression_adapter_execute", "regression", regression.test_adapter_execute_valid_context, "regression"),
        _build_descriptor("regression_schema_rejects_invalid", "regression", regression.test_schema_rejects_invalid, "regression"),
        _build_descriptor("regression_schema_accepts_valid", "regression", regression.test_schema_accepts_valid, "regression"),
    ],
    "drift": [
        _build_descriptor("drift_adapter_count", "drift", drift.test_adapter_count_drift, "drift"),
        _build_descriptor("drift_schema_count", "drift", drift.test_schema_count_drift, "drift"),
        _build_descriptor("drift_key_fingerprint", "drift", drift.test_key_fingerprint_drift, "drift"),
    ],
    "redteam": [
        _build_descriptor("redteam_toolgate_default_deny", "redteam", redteam.test_toolgate_default_deny, "security"),
        _build_descriptor("redteam_validator_rejects_dangerous", "redteam", redteam.test_validator_rejects_dangerous, "security"),
        _build_descriptor("redteam_scope_blocks_traversal", "redteam", redteam.test_scope_blocks_traversal, "security"),
    ],
}


def resolve_suites(suite_ids: list[str]) -> list[dict]:
    """Resolve suite identifiers to a flat list of test descriptors.

    Args:
        suite_ids: List of suite identifiers (e.g. ["smoke", "drift"]).

    Returns:
        List of test descriptor dicts with keys:
        test_id, suite_id, callable, category.

    Raises:
        ValueError: If any suite_id is unknown.
    """
    descriptors: list[dict] = []
    for sid in suite_ids:
        suite_tests = _SUITE_REGISTRY.get(sid)
        if suite_tests is None:
            raise ValueError(f"Unknown suite: '{sid}'")
        descriptors.extend(suite_tests)
    return descriptors
