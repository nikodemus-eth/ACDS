from __future__ import annotations

"""Build and validate GRITS run requests."""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def build_run_request(
    target_id: str,
    suite_ids: list[str],
    baseline_ref: str,
    trigger_type: str,
    openclaw_root: str | Path = "",
) -> dict:
    """Build a validated run request dictionary.

    Args:
        target_id: Identifier for the evaluation target.
        suite_ids: List of diagnostic suite identifiers.
        baseline_ref: Baseline reference identifier.
        trigger_type: One of "manual" or "scheduled".
        openclaw_root: Path to the openclaw root directory.

    Returns:
        A validated run request dictionary.

    Raises:
        ValueError: If any parameter is invalid.
    """
    _validate_params(target_id, suite_ids, baseline_ref, trigger_type)

    return {
        "schema_version": "1.0",
        "run_id": f"grits-{uuid.uuid4()}",
        "target_id": target_id,
        "trigger_type": trigger_type,
        "suite_ids": list(suite_ids),
        "baseline_ref": baseline_ref,
        "reporting_only": True,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python_version": sys.version.split()[0],
            "os": sys.platform,
            "node_id": os.environ.get("NODE_ID", "unknown"),
            "openclaw_root": str(openclaw_root),
        },
    }


_VALID_SUITES = {"smoke", "regression", "drift", "redteam"}
_VALID_TRIGGERS = {"manual", "scheduled"}


def _validate_params(
    target_id: str,
    suite_ids: list[str],
    baseline_ref: str,
    trigger_type: str,
) -> None:
    """Validate run request parameters."""
    if not target_id:
        raise ValueError("target_id must not be empty")
    if not suite_ids:
        raise ValueError("suite_ids must not be empty")
    invalid = set(suite_ids) - _VALID_SUITES
    if invalid:
        raise ValueError(f"Invalid suite_ids: {invalid}")
    if not baseline_ref:
        raise ValueError("baseline_ref must not be empty")
    if trigger_type not in _VALID_TRIGGERS:
        raise ValueError(
            f"trigger_type must be one of {_VALID_TRIGGERS}, got '{trigger_type}'"
        )
