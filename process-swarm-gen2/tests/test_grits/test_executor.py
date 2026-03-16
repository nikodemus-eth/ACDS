from __future__ import annotations

"""Tests for the GRITS executor module."""

import pytest

from grits.executor import execute_diagnostics


def _pass_test(context):
    return "passed", {"value": 42}, {"note": "all good"}


def _fail_test(context):
    return "failed", {"value": 0}, {"reason": "check failed"}


def _error_test(context):
    raise RuntimeError("something exploded")


def test_executor_handles_passing_test():
    """Executor records passed status correctly."""
    descriptors = [
        {"test_id": "t1", "suite_id": "smoke", "callable": _pass_test, "category": "health"},
    ]
    results = execute_diagnostics(descriptors, {"openclaw_root": "/tmp"})

    assert len(results) == 1
    assert results[0]["status"] == "passed"
    assert results[0]["metrics"]["value"] == 42
    assert results[0]["error"] is None


def test_executor_handles_failing_test():
    """Executor records failed status correctly."""
    descriptors = [
        {"test_id": "t2", "suite_id": "smoke", "callable": _fail_test, "category": "health"},
    ]
    results = execute_diagnostics(descriptors, {"openclaw_root": "/tmp"})

    assert len(results) == 1
    assert results[0]["status"] == "failed"
    assert results[0]["error"] is None


def test_executor_handles_error_test():
    """Executor catches exceptions and records error status."""
    descriptors = [
        {"test_id": "t3", "suite_id": "smoke", "callable": _error_test, "category": "health"},
    ]
    results = execute_diagnostics(descriptors, {"openclaw_root": "/tmp"})

    assert len(results) == 1
    assert results[0]["status"] == "error"
    assert "exploded" in results[0]["error"]
    assert results[0]["evidence"]["exception"] == "something exploded"


def test_executor_processes_multiple_tests():
    """Executor processes a mix of pass/fail/error tests."""
    descriptors = [
        {"test_id": "t1", "suite_id": "s", "callable": _pass_test, "category": "h"},
        {"test_id": "t2", "suite_id": "s", "callable": _fail_test, "category": "h"},
        {"test_id": "t3", "suite_id": "s", "callable": _error_test, "category": "h"},
    ]
    results = execute_diagnostics(descriptors, {"openclaw_root": "/tmp"})

    assert len(results) == 3
    statuses = [r["status"] for r in results]
    assert statuses == ["passed", "failed", "error"]


def test_executor_includes_measured_at():
    """Each result has a measured_at timestamp."""
    descriptors = [
        {"test_id": "t1", "suite_id": "s", "callable": _pass_test, "category": "h"},
    ]
    results = execute_diagnostics(descriptors, {"openclaw_root": "/tmp"})

    assert "measured_at" in results[0]
    assert "T" in results[0]["measured_at"]  # ISO format
