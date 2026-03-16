"""Behavior proposal validation for the M4 sovereign runtime.

The validator enforces structural and semantic rules on behavior proposals.
Validation does not grant execution authority. It certifies admissibility.

Checks:
1. Schema conformance
2. Scope containment (modifications within allowed paths)
3. No undeclared side effects
4. Deterministic acceptance tests
5. No self-certifying language
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from runtime.identity.signer import sign_and_attach
from runtime.schemas.schema_validator import validate_artifact


# Patterns that indicate non-deterministic or dangerous commands
NON_DETERMINISTIC_PATTERNS = [
    r"\$RANDOM",
    r"\bdate\s+\+%s\b",
    r"\bcurl\b",
    r"\bwget\b",
    r"\bfetch\b",
    r"\bnc\b",
    r"\btelnet\b",
    r"\bssh\b",
    r"\$\(date\b",
    r"\bmktemp\b",
    r"\buuidgen\b",
    # Dangerous execution patterns
    r"\bpython\s+-c\b",
    r"\bpython3\s+-c\b",
    r"\bnode\s+-e\b",
    r"\bperl\s+-e\b",
    r"\bruby\s+-e\b",
    r"\bbash\s+-c\b",
    r"\bsh\s+-c\b",
    r"\beval\b",
    r"\bexec\b",
    r"\bxargs\b",
    # Shell chaining / injection vectors
    r";",
    r"&&",
    r"\|\|",
    r"\|",
    r"`",
    r"\$\(",
    r"\$\{",
]

# Phrases that indicate self-certification
SELF_CERTIFYING_PATTERNS = [
    r"this proposal is approved",
    r"execution is authorized",
    r"automatically approved",
    r"pre-authorized",
    r"self-certif",
    r"bypass validation",
    r"skip gate",
]


def _check_schema(proposal: dict, schemas_dir: Optional[Path] = None) -> dict:
    """Check schema conformance."""
    result = validate_artifact(proposal, "behavior_proposal", schemas_dir)
    return {
        "check_name": "schema_conformance",
        "passed": result.valid,
        "detail": "Schema valid" if result.valid else "; ".join(result.errors),
    }


def _check_scope_containment(proposal: dict) -> dict:
    """Check that all modification paths are within scope boundary."""
    scope = proposal.get("scope_boundary", {})
    allowed = set(scope.get("allowed_paths", []))
    denied = set(scope.get("denied_paths", []))

    violations = []
    for mod in proposal.get("modifications", []):
        mod_path = mod.get("path", "")

        # SECURITY: Reject path traversal attempts
        if ".." in mod_path:
            violations.append(f"Path '{mod_path}' contains traversal sequence '..'")
            continue

        # Check if path is within any allowed path
        in_allowed = any(
            mod_path == a or mod_path.startswith(a.rstrip("/") + "/")
            for a in allowed
        )
        if not in_allowed:
            violations.append(f"Path '{mod_path}' not within allowed paths")

        # Check if path is in denied paths
        in_denied = any(
            mod_path == d or mod_path.startswith(d.rstrip("/") + "/")
            for d in denied
        )
        if in_denied:
            violations.append(f"Path '{mod_path}' is in denied paths")

    passed = len(violations) == 0
    return {
        "check_name": "scope_containment",
        "passed": passed,
        "detail": "All paths within scope" if passed else "; ".join(violations),
    }


def _check_undeclared_side_effects(proposal: dict) -> dict:
    """Check that all modification paths appear in target_paths."""
    target_paths = set(proposal.get("target_paths", []))
    declared_effects = set(proposal.get("declared_side_effects", []))

    undeclared = []
    for mod in proposal.get("modifications", []):
        mod_path = mod.get("path", "")
        if mod_path not in target_paths:
            if mod_path not in declared_effects:
                undeclared.append(f"Modification path '{mod_path}' not in target_paths")

    passed = len(undeclared) == 0
    return {
        "check_name": "no_undeclared_side_effects",
        "passed": passed,
        "detail": "No undeclared side effects" if passed else "; ".join(undeclared),
    }


def _check_deterministic_tests(proposal: dict) -> dict:
    """Check that acceptance tests use deterministic commands."""
    violations = []
    for test in proposal.get("acceptance_tests", []):
        command = test.get("command", "")
        for pattern in NON_DETERMINISTIC_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                violations.append(
                    f"Test '{test.get('test_id', '?')}' contains "
                    f"non-deterministic pattern: {pattern}"
                )

    passed = len(violations) == 0
    return {
        "check_name": "deterministic_tests",
        "passed": passed,
        "detail": "All tests deterministic" if passed else "; ".join(violations),
    }


def _check_no_self_certification(proposal: dict) -> dict:
    """Check that the proposal does not attempt to self-certify."""
    violations = []
    text_to_check = proposal.get("intent", "")

    for pattern in SELF_CERTIFYING_PATTERNS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            violations.append(f"Self-certifying language detected: {pattern}")

    passed = len(violations) == 0
    return {
        "check_name": "no_self_certification",
        "passed": passed,
        "detail": "No self-certification" if passed else "; ".join(violations),
    }


def validate_proposal(
    proposal: dict,
    keys_dir: Path,
    schemas_dir: Optional[Path] = None,
) -> dict:
    """Validate a behavior proposal through all checks.

    Returns a behavior_validation_result artifact, signed by validator_signer.
    """
    checks = [
        _check_schema(proposal, schemas_dir),
        _check_scope_containment(proposal),
        _check_undeclared_side_effects(proposal),
        _check_deterministic_tests(proposal),
        _check_no_self_certification(proposal),
    ]

    all_passed = all(c["passed"] for c in checks)

    result = {
        "validation_id": str(uuid.uuid4()),
        "proposal_id": proposal.get("proposal_id", "unknown"),
        "status": "passed" if all_passed else "failed",
        "checks": checks,
        "validated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Sign with validator_signer
    result = sign_and_attach(result, "validator_signer", keys_dir)

    return result
