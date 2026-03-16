from __future__ import annotations

import copy

_ARTIFACT_TYPES = {"document", "audio", "report", "dataset", "analysis"}
_EXECUTION_MODES = {"sequential", "parallel", "conditional"}
_VALIDATION_FAILURE_ACTIONS = {"reject", "repair", "flag_for_review"}
_EXECUTION_FAILURE_ACTIONS = {"stop", "retry", "partial_complete", "flag_for_review"}
_CONSTRAINT_SEVERITIES = {"low", "medium", "high", "critical"}

_DEFAULT_EXECUTION_POLICY = {
    "mode": "sequential",
    "retry_policy": {"max_retries": 1, "retry_on_failure": True},
}
_DEFAULT_FAILURE_HANDLING = {
    "on_validation_failure": "reject",
    "on_execution_failure": "flag_for_review",
}
_DEFAULT_LINEAGE_TRACKING = {
    "enabled": True,
    "record_inputs": True,
    "record_outputs": True,
    "record_agent_lineage": True,
}


def repair_job(schema: dict, job: dict, errors: list[str]) -> dict:
    """Bounded repair of schema violations.

    Allowed: Add missing fields with defaults, fix invalid enums,
             fix producer_agent refs.
    Disallowed: Invent new fields, change objective, infinite retries.
    """
    repaired = copy.deepcopy(job)

    # Add missing top-level fields with safe defaults
    if "execution_policy" not in repaired or not isinstance(repaired.get("execution_policy"), dict):
        repaired["execution_policy"] = copy.deepcopy(_DEFAULT_EXECUTION_POLICY)

    if "failure_handling" not in repaired or not isinstance(repaired.get("failure_handling"), dict):
        repaired["failure_handling"] = copy.deepcopy(_DEFAULT_FAILURE_HANDLING)

    if "lineage_tracking" not in repaired or not isinstance(repaired.get("lineage_tracking"), dict):
        repaired["lineage_tracking"] = copy.deepcopy(_DEFAULT_LINEAGE_TRACKING)

    if "constraints" not in repaired:
        repaired["constraints"] = []

    if "tools" not in repaired:
        repaired["tools"] = []

    if "assumptions" not in repaired:
        repaired["assumptions"] = []

    # Fix execution_policy internals
    ep = repaired["execution_policy"]

    if ep.get("mode") not in _EXECUTION_MODES:
        ep["mode"] = "sequential"
    if "retry_policy" not in ep or not isinstance(ep.get("retry_policy"), dict):
        ep["retry_policy"] = {"max_retries": 1, "retry_on_failure": True}
    else:
        rp = ep["retry_policy"]
        if "max_retries" not in rp:
            rp["max_retries"] = 1
        if "retry_on_failure" not in rp:
            rp["retry_on_failure"] = True

    # Fix failure_handling internals
    fh = repaired["failure_handling"]

    if fh.get("on_validation_failure") not in _VALIDATION_FAILURE_ACTIONS:
        fh["on_validation_failure"] = "reject"
    if fh.get("on_execution_failure") not in _EXECUTION_FAILURE_ACTIONS:
        fh["on_execution_failure"] = "flag_for_review"

    # Fix lineage_tracking internals
    lt = repaired["lineage_tracking"]

    for field in ("enabled", "record_inputs", "record_outputs", "record_agent_lineage"):
        if field not in lt or not isinstance(lt[field], bool):
            lt[field] = True

    # Fix artifact_type enums
    if isinstance(repaired.get("artifacts"), list):
        for art in repaired["artifacts"]:
            if isinstance(art, dict):
                if art.get("artifact_type") not in _ARTIFACT_TYPES:
                    art["artifact_type"] = "document"

    # Fix constraint severity enums
    if isinstance(repaired.get("constraints"), list):
        for c in repaired["constraints"]:
            if isinstance(c, dict) and "severity" in c:
                if c["severity"] not in _CONSTRAINT_SEVERITIES:
                    c["severity"] = "medium"

    # Fix producer_agent references
    if isinstance(repaired.get("agents"), list) and isinstance(repaired.get("artifacts"), list):
        valid_agent_ids = {
            a["agent_id"] for a in repaired["agents"]
            if isinstance(a, dict) and "agent_id" in a
        }
        if valid_agent_ids:
            first_agent_id = repaired["agents"][0]["agent_id"]
            for art in repaired["artifacts"]:
                if isinstance(art, dict) and art.get("producer_agent") not in valid_agent_ids:
                    art["producer_agent"] = first_agent_id

    return repaired
