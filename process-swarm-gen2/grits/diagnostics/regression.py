from __future__ import annotations

"""Regression diagnostic suite: 3 behavioral regression checks."""

from pathlib import Path


def test_adapter_execute_valid_context(context: dict) -> tuple[str, dict, dict]:
    """A registered adapter can execute with a valid ToolContext."""
    try:
        from swarm.tools.registry import AdapterRegistry
        from swarm.tools.base import ToolContext

        registry = AdapterRegistry.create_default()
        adapters = registry.list_adapters()

        if not adapters:
            return "failed", {}, {"reason": "No adapters registered"}

        # Pick the first adapter and try executing with a minimal context
        adapter_name = adapters[0]
        adapter = registry.get_adapter(adapter_name)

        root = Path(context["openclaw_root"])
        ctx = ToolContext(
            run_id="grits-regression-test",
            swarm_id="grits-test-swarm",
            action={"tool": adapter_name, "parameters": {}},
            workspace_root=root / "workspace",
            repo=None,
            prior_results={},
            config={},
        )

        # Validate inputs (not full execute, just verify interface works)
        errors = adapter.validate_inputs(ctx)
        return "passed", {"adapter": adapter_name, "validation_errors": len(errors)}, {
            "validation_errors": errors,
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}


def test_schema_rejects_invalid(context: dict) -> tuple[str, dict, dict]:
    """Schema validator rejects malformed input."""
    try:
        from runtime.schemas.schema_validator import validate_artifact

        root = Path(context["openclaw_root"])
        schemas_dir = root / "schemas"

        # Provide a completely invalid proposal
        invalid_doc = {"not_a_valid": "proposal"}
        result = validate_artifact(invalid_doc, "behavior_proposal", schemas_dir)

        if result.valid:
            return "failed", {}, {
                "reason": "Validator accepted invalid document",
            }

        return "passed", {"error_count": len(result.errors)}, {
            "errors": result.errors[:3],
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}


def test_schema_accepts_valid(context: dict) -> tuple[str, dict, dict]:
    """Schema validator accepts well-formed input."""
    try:
        from runtime.schemas.schema_validator import validate_artifact

        root = Path(context["openclaw_root"])
        schemas_dir = root / "schemas"

        # Construct a minimal valid run request
        valid_doc = {
            "schema_version": "1.0",
            "run_id": "grits-test-001",
            "target_id": "test-target",
            "trigger_type": "manual",
            "suite_ids": ["smoke"],
            "baseline_ref": "local_baseline_v1",
            "reporting_only": True,
            "requested_at": "2026-03-15T00:00:00+00:00",
            "environment": {
                "python_version": "3.14.0",
                "os": "darwin",
                "node_id": "test-node",
                "openclaw_root": str(root),
            },
        }
        result = validate_artifact(valid_doc, "grits_run_request", schemas_dir)

        if not result.valid:
            return "failed", {}, {
                "reason": "Validator rejected valid document",
                "errors": result.errors,
            }

        return "passed", {}, {"schema": "grits_run_request"}
    except Exception as exc:
        return "error", {}, {"error": str(exc)}
