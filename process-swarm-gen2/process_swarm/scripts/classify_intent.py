from __future__ import annotations


def classify_intent(classes: list[dict], intent_text: str) -> dict:
    """Route intent to best-matching job class using keyword scoring.

    Single-word keywords: +1 per match (token match, case-insensitive)
    Multi-word phrases: +2 per match (substring in lowered text)
    Falls back to 'generic_job' if score is 0.

    Returns: {selected_class_id, score, matched_keywords, fallback_used}
    """
    lowered = intent_text.lower()
    tokens = set(lowered.split())

    best_class_id: str = "generic_job"
    best_score: int = 0
    best_matched: list[str] = []

    for cls in classes:
        class_id = cls["class_id"]
        if class_id == "generic_job":
            continue

        score = 0
        matched: list[str] = []

        for keyword in cls.get("routing_keywords", []):
            kw_lower = keyword.lower()
            if " " in kw_lower:
                # Multi-word phrase: substring match, +2
                if kw_lower in lowered:
                    score += 2
                    matched.append(keyword)
            else:
                # Single-word: token match, +1
                if kw_lower in tokens:
                    score += 1
                    matched.append(keyword)

        if score > best_score:
            best_score = score
            best_class_id = class_id
            best_matched = matched

    return {
        "selected_class_id": best_class_id,
        "score": best_score,
        "matched_keywords": best_matched,
        "fallback_used": best_score == 0,
    }
