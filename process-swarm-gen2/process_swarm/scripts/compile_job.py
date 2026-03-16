from __future__ import annotations

from process_swarm.scripts.validate_job import validate_job
from process_swarm.scripts.repair_job import repair_job


def compile_job(schema: dict, job: dict, max_repairs: int = 2) -> dict:
    """Validate + bounded repair loop.

    Returns: {status: "accepted"|"rejected"|"flagged_for_review",
              attempt_count, validation_errors, final_job}
    """
    current_job = job
    all_errors: list[str] = []

    for attempt in range(1, max_repairs + 2):  # +1 for initial, +1 for final check
        valid, errors = validate_job(schema, current_job)
        if valid:
            return {
                "status": "accepted",
                "attempt_count": attempt,
                "validation_errors": [],
                "final_job": current_job,
            }

        all_errors = errors
        if attempt <= max_repairs:
            current_job = repair_job(schema, current_job, errors)
        else:
            break

    return {
        "status": "rejected",
        "attempt_count": max_repairs + 1,
        "validation_errors": all_errors,
        "final_job": current_job,
    }
