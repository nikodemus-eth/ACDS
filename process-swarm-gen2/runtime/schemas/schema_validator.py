"""JSON Schema validation engine for the M4 sovereign runtime.

Validates artifacts against their declared schemas using jsonschema Draft 2020-12.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import jsonschema

from runtime.schemas.loader import load_schema


@dataclass
class ValidationResult:
    """Result of schema validation."""
    valid: bool
    errors: list = field(default_factory=list)
    schema_name: str = ""


def validate_artifact(
    artifact: dict,
    schema_name: str,
    schemas_dir: Optional[Path] = None,
) -> ValidationResult:
    """Validate an artifact against a named JSON Schema.

    Args:
        artifact: The artifact dict to validate.
        schema_name: The schema name (e.g., 'behavior_proposal').
        schemas_dir: Optional override for schemas directory.

    Returns:
        ValidationResult with valid=True/False and error details.
    """
    try:
        schema = load_schema(schema_name, schemas_dir)
    except FileNotFoundError as e:
        return ValidationResult(
            valid=False,
            errors=[f"Schema not found: {e}"],
            schema_name=schema_name,
        )

    errors = []
    validator = jsonschema.Draft202012Validator(schema)

    for error in validator.iter_errors(artifact):
        path = ".".join(str(p) for p in error.absolute_path) if error.absolute_path else "(root)"
        errors.append(f"{path}: {error.message}")

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        schema_name=schema_name,
    )


def validate_artifact_strict(
    artifact: dict,
    schema_name: str,
    schemas_dir: Optional[Path] = None,
) -> dict:
    """Validate an artifact and raise on failure.

    Returns the artifact unchanged if valid.
    Raises ValueError with details if invalid.
    """
    result = validate_artifact(artifact, schema_name, schemas_dir)
    if not result.valid:
        error_text = "; ".join(result.errors)
        raise ValueError(
            f"Schema validation failed for {schema_name}: {error_text}"
        )
    return artifact
