"""Stage 2 -- SchemaValidator: validate CommandEnvelope parameters against JSON Schema.

Each command spec ships a ``parameters_schema`` that defines the
contract for its parameters.  The validator runs *all* checks via
:class:`jsonschema.Draft7Validator` so callers receive every error in a
single pass rather than fixing them one at a time.
"""

from __future__ import annotations

import time
from typing import Any

import jsonschema

from swarm.argus_hold.models import (
    CommandEnvelope,
    StageResult,
    StageVerdict,
)

_STAGE_NAME = "schema_validation"


class SchemaValidator:
    """Validates CommandEnvelope parameters against command spec schemas."""

    def validate(self, envelope: CommandEnvelope, spec: dict) -> StageResult:
        """Validate envelope parameters against the spec's ``parameters_schema``.

        Parameters
        ----------
        envelope:
            The command envelope whose ``.parameters`` will be checked.
        spec:
            The command specification dict; must contain a
            ``parameters_schema`` key with a valid JSON Schema object.

        Returns
        -------
        StageResult
            Verdict is :attr:`StageVerdict.PASSED` when all parameters
            conform, :attr:`StageVerdict.FAILED` otherwise.  Every
            individual validation error is captured in ``errors``.
        """
        start = time.monotonic()

        schema: dict[str, Any] = spec.get("parameters_schema", {})
        if not schema:
            # No schema defined -- nothing to validate.
            duration_ms = int((time.monotonic() - start) * 1000)
            return StageResult(
                stage_name=_STAGE_NAME,
                verdict=StageVerdict.PASSED,
                duration_ms=duration_ms,
                details={"schema_present": False},
                warnings=["No parameters_schema defined in command spec; "
                          "validation skipped."],
            )

        validator = jsonschema.Draft7Validator(schema)
        errors: list[str] = []

        for error in validator.iter_errors(envelope.parameters):
            # Build a human-readable path such as "path.to.field".
            json_path = ".".join(str(p) for p in error.absolute_path) or "(root)"
            errors.append(f"{json_path}: {error.message}")

        duration_ms = int((time.monotonic() - start) * 1000)

        if errors:
            return StageResult(
                stage_name=_STAGE_NAME,
                verdict=StageVerdict.FAILED,
                duration_ms=duration_ms,
                details={
                    "schema_present": True,
                    "error_count": len(errors),
                },
                errors=errors,
            )

        return StageResult(
            stage_name=_STAGE_NAME,
            verdict=StageVerdict.PASSED,
            duration_ms=duration_ms,
            details={
                "schema_present": True,
                "error_count": 0,
            },
        )
