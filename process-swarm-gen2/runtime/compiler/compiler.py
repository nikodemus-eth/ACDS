"""Execution plan compiler for the M4 sovereign runtime.

Converts validated behavior proposals into executable plans.
Compilation creates the first artifact intended for execution,
but does not itself authorize execution.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from runtime.identity.signer import sign_and_attach, verify_attached_signature


# Maps proposal operations to required ToolGate capabilities
OPERATION_CAPABILITIES = {
    "create": "FILESYSTEM_WRITE",
    "modify": "FILESYSTEM_WRITE",
    "delete": "FILESYSTEM_WRITE",
    "append": "FILESYSTEM_WRITE",
}


def compile_plan(
    proposal: dict,
    validation_result: dict,
    keys_dir: Path,
    schemas_dir: Optional[Path] = None,
) -> dict:
    """Compile a validated proposal into an execution plan.

    Returns an execution_plan artifact, signed by compiler_signer.

    Raises:
        ValueError: If validation failed or referential integrity broken.
    """
    if validation_result.get("status") != "passed":
        raise ValueError(
            f"Cannot compile plan from failed validation: "
            f"status={validation_result.get('status')}"
        )

    if validation_result.get("proposal_id") != proposal.get("proposal_id"):
        raise ValueError(
            f"Validation result proposal_id "
            f"({validation_result.get('proposal_id')}) "
            f"does not match proposal ({proposal.get('proposal_id')})"
        )

    if validation_result.get("signature"):
        if not verify_attached_signature(validation_result, keys_dir):
            raise ValueError("Validation result signature verification failed")

    # Build execution steps from modifications
    steps = []
    required_capabilities = set()

    for i, mod in enumerate(proposal.get("modifications", [])):
        operation = mod.get("operation", "modify")
        capability = OPERATION_CAPABILITIES.get(operation, "FILESYSTEM_WRITE")
        required_capabilities.add(capability)

        step = {
            "step_id": f"step-{i + 1:03d}",
            "operation": operation,
            "path": mod.get("path", ""),
            "content": mod.get("content", ""),
            "required_capability": capability,
        }
        steps.append(step)

    # Add test execution steps
    for test in proposal.get("acceptance_tests", []):
        required_capabilities.add("TEST_EXECUTION")
        step = {
            "step_id": f"test-{test.get('test_id', 'unknown')}",
            "operation": "run_test",
            "path": test.get("command", ""),
            "content": "",
            "required_capability": "TEST_EXECUTION",
        }
        steps.append(step)

    scope = proposal.get("scope_boundary", {})

    plan = {
        "plan_id": str(uuid.uuid4()),
        "proposal_id": proposal.get("proposal_id"),
        "validation_id": validation_result.get("validation_id"),
        "steps": steps,
        "required_capabilities": sorted(required_capabilities),
        "scope_constraints": {
            "allowed_paths": scope.get("allowed_paths", []),
        },
        "compiled_at": datetime.now(timezone.utc).isoformat(),
    }

    plan = sign_and_attach(plan, "compiler_signer", keys_dir)

    return plan
