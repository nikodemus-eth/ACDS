from __future__ import annotations

import jsonschema


def validate_job(schema: dict, job: dict) -> tuple[bool, list[str]]:
    """Validate job against JSON schema + semantic checks.

    Layer 1: JSON Schema validation
    Layer 2: Semantic checks:
      - Every artifact's producer_agent must reference a valid agent_id

    Returns: (True, []) if valid, (False, [errors]) if invalid
    """
    errors: list[str] = []

    # Layer 1: JSON Schema validation
    validator = jsonschema.Draft202012Validator(schema)
    for error in sorted(validator.iter_errors(job), key=lambda e: list(e.path)):
        path = ".".join(str(p) for p in error.absolute_path)
        if path:
            errors.append(f"Schema: {path}: {error.message}")
        else:
            errors.append(f"Schema: {error.message}")

    # Layer 2: Semantic checks (only if basic structure is present)
    agents = job.get("agents")
    artifacts = job.get("artifacts")
    if isinstance(agents, list) and isinstance(artifacts, list):
        valid_agent_ids = {a["agent_id"] for a in agents if isinstance(a, dict) and "agent_id" in a}
        for art in artifacts:
            if isinstance(art, dict) and "producer_agent" in art:
                if art["producer_agent"] not in valid_agent_ids:
                    errors.append(
                        f"Semantic: artifact '{art.get('artifact_id', '?')}' "
                        f"references unknown producer_agent '{art['producer_agent']}'"
                    )

    if errors:
        return False, errors
    return True, []
