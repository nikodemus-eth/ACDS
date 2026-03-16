"""Bridge translator — bidirectional conversion between Integration and M4 formats.

Integration proposals use operation_class-specific specs (change_spec, code_edit_spec,
test_spec) while M4 proposals use a flat modifications list. This module handles the
translation in both directions.

Also provides BridgePipeline for end-to-end bridge processing with governance checks.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


# Maps integration change_spec modes to M4 operations
_MODE_TO_OP: dict[str, str] = {
    "create_file": "create",
    "append_text": "append",
    "replace_text": "modify",
    "delete_file": "delete",
}

# Maps integration side_effect_flags to M4 capabilities
_SIDE_EFFECT_TO_CAPABILITY: dict[str, str] = {
    "filesystem_write": "FILE_WRITE",
    "filesystem_read": "FILE_READ",
    "network_access": "NETWORK",
    "process_exec": "PROCESS_EXEC",
}

# Maps integration operation_class to M4 operation type
_OPERATION_CLASS_TO_OP: dict[str, str] = {
    "docs_edit": "append",
    "code_edit": "modify",
    "test_run": "create",
    "config_edit": "modify",
    "asset_create": "create",
}

# Source mapping based on author_agent patterns
_SOURCE_PATTERNS: dict[str, str] = {
    "behavior_author": "m2",
    "planner": "m2",
    "author": "m2",
    "swarm": "m2",
    "gateway": "gateway",
}


def integration_proposal_to_m4(proposal: dict[str, Any]) -> dict[str, Any]:
    """Convert an Integration-format proposal to M4 format.

    Args:
        proposal: Integration-format behavior_proposal dict.

    Returns:
        M4-format proposal dict with modifications, scope_boundary, etc.

    Raises:
        ValueError: If operation_class is unsupported.
    """
    op_class = proposal.get("operation_class", "")
    if op_class not in _OPERATION_CLASS_TO_OP:
        raise ValueError(f"Unsupported operation_class: '{op_class}'")

    # Determine source from author_agent
    author = proposal.get("author_agent", "")
    source = "operator"
    for pattern, src in _SOURCE_PATTERNS.items():
        if pattern in author:
            source = src
            break

    # Extract target path
    target = proposal.get("target", {})
    target_path = target.get("path", "")

    # Build modifications based on operation_class
    modifications = _build_modifications(proposal, op_class, target_path)

    # Build acceptance tests
    raw_tests = proposal.get("constraints", {}).get("acceptance_tests", [])
    acceptance_tests = []
    for i, test in enumerate(raw_tests):
        if isinstance(test, str):
            acceptance_tests.append({
                "test_id": f"bridge-test-{i:03d}",
                "command": test,
                "expected_exit_code": 0,
            })
        elif isinstance(test, dict):
            acceptance_tests.append(test)

    # Ensure at least one acceptance test
    if not acceptance_tests:
        acceptance_tests.append({
            "test_id": "bridge-test-default",
            "command": "echo 'bridge default test'",
            "expected_exit_code": 0,
        })

    # Build scope boundary
    scope = proposal.get("scope", {})
    scope_boundary = {
        "allowed_paths": scope.get("allowed_paths", [target_path] if target_path else []),
        "denied_paths": proposal.get("constraints", {}).get("disallowed_paths", []),
    }

    # Assemble M4 proposal
    m4: dict[str, Any] = {
        "proposal_id": proposal.get("proposal_id", f"bridge-{uuid.uuid4().hex[:8]}"),
        "source": source,
        "intent": proposal.get("intent_summary", ""),
        "target_paths": [target_path] if target_path else [],
        "modifications": modifications,
        "acceptance_tests": acceptance_tests,
        "scope_boundary": scope_boundary,
        "side_effect_flags": proposal.get("constraints", {}).get("side_effect_flags", []),
        "created_at": proposal.get("created_at", datetime.now(timezone.utc).isoformat()),
    }

    return m4


def _build_modifications(
    proposal: dict[str, Any], op_class: str, target_path: str
) -> list[dict[str, Any]]:
    """Build the modifications list based on operation_class."""
    modifications: list[dict[str, Any]] = []

    if op_class == "docs_edit":
        change_spec = proposal.get("change_spec", {})
        mode = change_spec.get("mode", "append_text")
        op = _MODE_TO_OP.get(mode, "append")
        modifications.append({
            "path": target_path,
            "operation": op,
            "content": change_spec.get("text", ""),
        })

    elif op_class == "code_edit":
        code_spec = proposal.get("code_edit_spec", {})
        modifications.append({
            "path": target_path,
            "operation": "modify",
            "content": code_spec.get("replacement_text", ""),
        })

    elif op_class == "test_run":
        test_spec = proposal.get("test_spec", {})
        argv = test_spec.get("argv", [])
        command = " ".join(str(a) for a in argv) if argv else "echo 'no test'"
        modifications.append({
            "path": target_path,
            "operation": "create",
            "content": command,
        })

    elif op_class in ("config_edit", "asset_create"):
        change_spec = proposal.get("change_spec", {})
        mode = change_spec.get("mode", "modify")
        op = _MODE_TO_OP.get(mode, _OPERATION_CLASS_TO_OP[op_class])
        modifications.append({
            "path": target_path,
            "operation": op,
            "content": change_spec.get("text", change_spec.get("content", "")),
        })

    return modifications


def extract_bridge_metadata(proposal: dict[str, Any]) -> dict[str, Any]:
    """Extract bridge metadata from an integration proposal for round-trip tracking."""
    return {
        "origin": "openclaw-integration",
        "original_proposal_id": proposal.get("proposal_id", ""),
        "operation_class": proposal.get("operation_class", ""),
        "author_agent": proposal.get("author_agent", ""),
        "namespace": proposal.get("namespace", {}),
        "target": proposal.get("target", {}),
        "constraints": proposal.get("constraints", {}),
    }


def m4_record_to_integration_result(
    record: dict[str, Any],
    bridge_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Convert an M4 execution record back to integration result format.

    Args:
        record: M4 execution record dict.
        bridge_metadata: Optional metadata from the original proposal.

    Returns:
        Integration-format execution_result dict.
    """
    exec_status = record.get("execution_status", "failed")
    status = "success" if exec_status == "completed" else "failed"

    # Extract step IDs
    actions = record.get("actions", [])
    steps_executed = [a["step_id"] for a in actions if a.get("step_id")]

    # Extract test IDs
    acceptance_results = record.get("acceptance_results", [])
    tests_executed = [r["test_id"] for r in acceptance_results if r.get("test_id")]

    # Extract modified file paths
    files_modified = [a["path"] for a in actions if a.get("path")]

    # Build result notes
    executor = record.get("executor_node_id", "unknown")
    lease_id = record.get("lease_id", "unknown")
    notes = [
        f"Executed by node: {executor}",
        f"Lease ID: {lease_id}",
    ]

    # Recover namespace from bridge metadata if available
    namespace = {}
    if bridge_metadata:
        namespace = bridge_metadata.get("namespace", {})

    result: dict[str, Any] = {
        "artifact_type": "execution_result",
        "version": "0.1",
        "status": status,
        "plan_id": record.get("plan_id", ""),
        "record_id": record.get("record_id", ""),
        "steps_executed": steps_executed,
        "tests_executed": tests_executed,
        "files_modified": files_modified,
        "result_notes": notes,
        "namespace": namespace,
        "executed_at": record.get("executed_at", ""),
    }

    return result


class BridgePipeline:
    """End-to-end bridge with governance checks.

    Translates integration proposals to M4 format, runs governance warning
    checks, and deposits the result for ingress processing.
    """

    def __init__(self, openclaw_root: str | Path):
        self.openclaw_root = Path(openclaw_root).resolve()

    def deposit_for_ingress(
        self,
        proposal: dict[str, Any],
        quarantine_dir: str | Path,
    ) -> Path:
        """Translate and deposit a proposal for ingress processing.

        Args:
            proposal: Integration-format proposal.
            quarantine_dir: Directory to deposit the translated proposal.

        Returns:
            Path to the deposited M4-format proposal file.

        Raises:
            ValueError: If governance checks block the proposal.
        """
        # Run governance warning checks
        self._enforce_bridge_warning_policy(proposal)

        # Translate to M4
        m4_proposal = integration_proposal_to_m4(proposal)

        # Ensure quarantine directory exists
        q_dir = Path(quarantine_dir)
        q_dir.mkdir(parents=True, exist_ok=True)

        # Write to quarantine
        proposal_id = m4_proposal.get("proposal_id", uuid.uuid4().hex[:12])
        dest = q_dir / f"{proposal_id}.json"
        with open(dest, "w") as f:
            json.dump(m4_proposal, f, indent=2)

        return dest

    def _enforce_bridge_warning_policy(self, proposal: dict[str, Any]) -> None:
        """Run governance checks on the proposal before translation.

        Checks for authority boundary violations:
        - Network access requested
        - Package installation requested
        - External API access requested
        """
        scope = proposal.get("scope", {})
        violations: list[str] = []

        if scope.get("allow_network"):
            violations.append("Network access requested across bridge boundary")
        if scope.get("allow_package_install"):
            violations.append("Package installation requested across bridge boundary")
        if scope.get("allow_external_apis"):
            violations.append("External API access requested across bridge boundary")

        if violations:
            raise ValueError(
                f"Bridge warning policy blocked proposal: {'; '.join(violations)}"
            )
