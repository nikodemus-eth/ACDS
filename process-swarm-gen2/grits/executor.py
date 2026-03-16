from __future__ import annotations

"""Execute diagnostic tests and record structured results."""

from datetime import datetime, timezone


def execute_diagnostics(
    test_descriptors: list[dict], context: dict,
) -> list[dict]:
    """Execute each diagnostic test and capture structured results.

    Args:
        test_descriptors: List of test descriptors from suite_resolver.
        context: Execution context dict (must contain 'openclaw_root').

    Returns:
        List of result dicts with keys:
        test_id, suite_id, status, measured_at, metrics, evidence, error.
    """
    results: list[dict] = []
    for descriptor in test_descriptors:
        result = _run_single(descriptor, context)
        results.append(result)
    return results


def _run_single(descriptor: dict, context: dict) -> dict:
    """Run a single diagnostic test safely."""
    test_id = descriptor["test_id"]
    suite_id = descriptor["suite_id"]
    callable_fn = descriptor["callable"]

    try:
        status, metrics, evidence = callable_fn(context)
        return {
            "test_id": test_id,
            "suite_id": suite_id,
            "status": status,
            "measured_at": datetime.now(timezone.utc).isoformat(),
            "metrics": metrics,
            "evidence": evidence,
            "error": None,
        }
    except Exception as exc:
        return {
            "test_id": test_id,
            "suite_id": suite_id,
            "status": "error",
            "measured_at": datetime.now(timezone.utc).isoformat(),
            "metrics": {},
            "evidence": {"exception": str(exc)},
            "error": str(exc),
        }
