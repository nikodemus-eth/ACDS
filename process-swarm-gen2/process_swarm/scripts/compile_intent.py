from __future__ import annotations

import json
import pathlib

from process_swarm.scripts.generate_job_from_intent import generate_job
from process_swarm.scripts.compile_job import compile_job
from process_swarm.scripts.plan_job_execution import plan_execution


def _load_json(path: str | pathlib.Path) -> dict | list:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: str | pathlib.Path, data: dict | list) -> None:
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def compile_from_intent(
    schema_path: str,
    intent_text: str,
    max_repairs: int = 2,
    do_plan: bool = False,
    output_dir: str | None = None,
) -> dict:
    """Full pipeline: intent -> classify -> extract -> merge -> generate ->
    compile -> plan.

    Writes intermediate artifacts to output_dir if provided.

    Returns: {status, candidate_job_path, final_job_path, execution_plan_path,
              attempt_count, validation_errors, assumptions}
    """
    base = pathlib.Path(__file__).resolve().parent.parent

    schema = _load_json(schema_path)
    classes = _load_json(base / "classes" / "job_classes.json")
    defaults = _load_json(base / "classes" / "job_class_defaults.json")
    patterns = _load_json(base / "extraction" / "parameter_patterns.json")

    # Generate candidate job
    gen_result = generate_job(schema, classes, defaults, patterns, intent_text)
    candidate_job = gen_result["candidate_job"]

    candidate_job_path: str | None = None
    final_job_path: str | None = None
    execution_plan_path: str | None = None

    if output_dir is not None:
        out = pathlib.Path(output_dir)
        candidate_job_path = str(out / "candidate_job.json")
        _write_json(candidate_job_path, candidate_job)

    # Compile (validate + repair)
    compile_result = compile_job(schema, candidate_job, max_repairs=max_repairs)
    final_job = compile_result["final_job"]

    if output_dir is not None:
        out = pathlib.Path(output_dir)
        final_job_path = str(out / "final_job.json")
        _write_json(final_job_path, final_job)

    # Plan execution
    plan: dict | None = None
    if do_plan and compile_result["status"] == "accepted":
        plan = plan_execution(final_job)
        if output_dir is not None:
            out = pathlib.Path(output_dir)
            execution_plan_path = str(out / "execution_plan.json")
            _write_json(execution_plan_path, plan)

    return {
        "status": compile_result["status"],
        "candidate_job_path": candidate_job_path,
        "final_job_path": final_job_path,
        "execution_plan_path": execution_plan_path,
        "attempt_count": compile_result["attempt_count"],
        "validation_errors": compile_result["validation_errors"],
        "assumptions": final_job.get("assumptions", []),
    }
