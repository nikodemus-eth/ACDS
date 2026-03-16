from __future__ import annotations

# Categories that return a single value (first match) or None
_SINGULAR_CATEGORIES = {"cadence", "time_horizon", "execution_mode"}

# Categories that return a deduplicated list
_PLURAL_CATEGORIES = {"artifact_formats", "artifact_types", "source_scope", "analysis_focus"}


def extract_parameters(patterns: dict, intent_text: str) -> dict:
    """Extract structured parameters from intent using pattern matching.

    Multi-word patterns: substring match in lowered intent.
    Single-word patterns: token match.

    Singular categories (cadence, time_horizon, execution_mode): return first
    match or None.
    Plural categories: return deduplicated list or [].

    Returns dict with: cadence, time_horizon, artifact_formats, artifact_types,
    source_scope, analysis_focus, execution_mode, unresolved_details.
    """
    lowered = intent_text.lower()
    tokens = set(lowered.split())

    result: dict = {}

    all_categories = _SINGULAR_CATEGORIES | _PLURAL_CATEGORIES

    for category in all_categories:
        entries = patterns.get(category, [])

        if category in _SINGULAR_CATEGORIES:
            matched_value = None
            for entry in entries:
                for pattern in entry["patterns"]:
                    pat_lower = pattern.lower()
                    if " " in pat_lower:
                        if pat_lower in lowered:
                            matched_value = entry["normalized"]
                            break
                    else:
                        if pat_lower in tokens:
                            matched_value = entry["normalized"]
                            break
                if matched_value is not None:
                    break
            result[category] = matched_value
        else:
            matched_values: list[str] = []
            seen: set[str] = set()
            for entry in entries:
                for pattern in entry["patterns"]:
                    pat_lower = pattern.lower()
                    if " " in pat_lower:
                        if pat_lower in lowered:
                            if entry["normalized"] not in seen:
                                matched_values.append(entry["normalized"])
                                seen.add(entry["normalized"])
                            break
                    else:
                        if pat_lower in tokens:
                            if entry["normalized"] not in seen:
                                matched_values.append(entry["normalized"])
                                seen.add(entry["normalized"])
                            break
            result[category] = matched_values

    result["unresolved_details"] = []
    return result
