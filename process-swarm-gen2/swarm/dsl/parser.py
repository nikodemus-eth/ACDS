"""DSL parser and validator.

Parses YAML behavior definitions into DslDefinition objects and validates
them for safety (path traversal, dangerous commands, constraint compliance).
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from swarm.dsl.models import (
    DslAcceptanceTest,
    DslConstraints,
    DslDefinition,
    DslMetadata,
    DslStep,
    OperationType,
)

_DANGEROUS_PATTERNS = re.compile(
    r"\b(curl|wget|nc|ncat|python|python3|ruby|perl|php|node|eval|exec|bash\s+-c"
    r"|sh\s+-c|sudo|su\s|dd\s|mkfs|fdisk|mount|umount|chown|chmod\s+777)\b"
    r"|[;|&`$]",
    re.IGNORECASE,
)

_OP_NAMES = {e.value for e in OperationType}


def parse_dsl(yaml_str: str) -> DslDefinition:
    """Parse a YAML string into a DslDefinition.

    Raises ValueError if the YAML is malformed or missing required fields.
    """
    raw = yaml.safe_load(yaml_str)
    if not isinstance(raw, dict):
        raise ValueError("DSL must be a YAML mapping")

    raw_steps = raw.get("steps")
    if not raw_steps:
        raise ValueError("DSL must contain non-empty 'steps' list")

    steps = []
    for i, s in enumerate(raw_steps):
        if not isinstance(s, dict):
            raise ValueError(f"Step {i} must be a mapping")
        op_str = s.get("op")
        if not op_str:
            raise ValueError(f"Step {i}: missing required 'op' field")
        if op_str not in _OP_NAMES:
            raise ValueError(f"Step {i}: unknown operation type '{op_str}'")
        steps.append(
            DslStep(
                op=OperationType(op_str),
                path=s.get("path"),
                content=s.get("content"),
                command=s.get("command"),
                expected_exit_code=s.get("expected_exit_code", 0),
            )
        )

    # Metadata
    raw_meta = raw.get("metadata", {})
    metadata = DslMetadata(
        version=raw_meta.get("version", 1),
        sequence_id=raw_meta.get("sequence_id"),
        created_at=raw_meta.get("created_at"),
    )

    # Constraints
    raw_constraints = raw.get("constraints", {})
    constraints = DslConstraints(
        max_files_modified=raw_constraints.get("max_files_modified"),
        allowed_operations=raw_constraints.get("allowed_operations"),
        execution_timeout=raw_constraints.get("execution_timeout"),
    )

    # Acceptance tests
    acceptance_tests = []
    for t in raw.get("acceptance_tests", []):
        acceptance_tests.append(
            DslAcceptanceTest(
                test_id=t["test_id"],
                command=t["command"],
                expected_exit_code=t.get("expected_exit_code", 0),
            )
        )

    return DslDefinition(
        steps=steps,
        metadata=metadata,
        constraints=constraints,
        acceptance_tests=acceptance_tests,
    )


def validate_dsl(definition: DslDefinition) -> list[str]:
    """Validate a parsed DslDefinition. Returns a list of error strings."""
    errors: list[str] = []

    # Check file ops have paths
    for i, step in enumerate(definition.steps):
        if step.is_file_operation() and not step.path:
            errors.append(f"Step {i}: file operation requires a 'path'")
        if step.is_test_operation() and not step.command:
            errors.append(f"Step {i}: test operation requires a 'command'")

    # Path traversal check
    for step in definition.steps:
        if step.path and ".." in step.path:
            errors.append(f"Path traversal detected in '{step.path}'")

    # Acceptance tests required
    if not definition.acceptance_tests:
        errors.append("At least one acceptance test is required")

    # Dangerous command patterns in acceptance tests
    for test in definition.acceptance_tests:
        if _DANGEROUS_PATTERNS.search(test.command):
            errors.append(
                f"Acceptance test '{test.test_id}' contains dangerous command: "
                f"{test.command}"
            )

    # Constraint: max_files_modified
    if definition.constraints.max_files_modified is not None:
        unique_paths = set()
        for step in definition.steps:
            if step.is_file_operation() and step.path:
                unique_paths.add(step.path)
        if len(unique_paths) > definition.constraints.max_files_modified:
            errors.append(
                f"max_files_modified constraint violated: "
                f"{len(unique_paths)} files > {definition.constraints.max_files_modified}"
            )

    return errors


def load_dsl_file(path: str | Path) -> DslDefinition:
    """Load and parse a DSL YAML file from disk."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"DSL file not found: {path}")
    return parse_dsl(p.read_text())
