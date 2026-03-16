"""Constraint extraction from user intent text.

Extracts structured constraints (sections, word counts, sources,
freshness windows, delivery channels, output formats) from raw
intent text using rule-based pattern matching.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ConstraintSet:
    sections: list[str] = field(default_factory=list)
    min_word_count: Optional[int] = None
    max_word_count: Optional[int] = None
    required_sources: Optional[int] = None
    freshness_window_days: Optional[int] = None
    delivery_channel: Optional[str] = None
    output_format: Optional[str] = None
    schedule_hint: Optional[str] = None
    fail_closed_conditions: list[str] = field(default_factory=list)
    custom: dict = field(default_factory=dict)


def extract_constraints(
    raw_text: str,
    archetype: str,
) -> ConstraintSet:
    """Extract constraints from raw intent text using rule-based matching."""
    return _rule_based_extract(raw_text, archetype)


def _rule_based_extract(raw_text: str, archetype: str) -> ConstraintSet:
    lower = raw_text.lower()
    cs = ConstraintSet()

    # Sections — look for enumerated items or explicit section mentions
    section_patterns = [
        r"sections?:\s*(.+?)(?:\.|$)",
        r"include\s+(?:the\s+following|these)\s+sections?:\s*(.+?)(?:\.|$)",
        r"cover(?:ing)?\s+(.+?)(?:\.|$)",
    ]
    for pattern in section_patterns:
        match = re.search(pattern, lower)
        if match:
            raw_sections = match.group(1)
            cs.sections = [s.strip() for s in re.split(r"[,;]|\band\b", raw_sections) if s.strip()]
            break

    # Word count
    wc_match = re.search(r"(\d+)\s*(?:to|-)\s*(\d+)\s*words?", lower)
    if wc_match:
        cs.min_word_count = int(wc_match.group(1))
        cs.max_word_count = int(wc_match.group(2))
    else:
        wc_match = re.search(r"(?:at least|minimum)\s+(\d+)\s*words?", lower)
        if wc_match:
            cs.min_word_count = int(wc_match.group(1))
        wc_match = re.search(r"(?:at most|maximum|no more than)\s+(\d+)\s*words?", lower)
        if wc_match:
            cs.max_word_count = int(wc_match.group(1))

    # Sources
    src_match = re.search(r"(\d+)\s*sources?", lower)
    if src_match:
        cs.required_sources = int(src_match.group(1))
    elif archetype in ("structured_report", "scheduled_structured_report"):
        cs.required_sources = 3

    # Freshness window
    fresh_match = re.search(r"(?:last|past|within)\s+(\d+)\s*(days?|weeks?|months?)", lower)
    if fresh_match:
        n = int(fresh_match.group(1))
        unit = fresh_match.group(2)
        if "week" in unit:
            n *= 7
        elif "month" in unit:
            n *= 30
        cs.freshness_window_days = n

    # Delivery channel
    if "email" in lower or "send to" in lower:
        cs.delivery_channel = "email"
    elif "telegram" in lower:
        cs.delivery_channel = "telegram"
    elif "slack" in lower:
        cs.delivery_channel = "slack"

    # Output format
    for fmt in ("pdf", "html", "markdown", "json", "csv", "xlsx"):
        if fmt in lower:
            cs.output_format = fmt
            break
    if not cs.output_format and archetype in ("structured_report", "scheduled_structured_report"):
        cs.output_format = "html"

    # Schedule hint
    schedule_patterns = {
        "daily": r"\bdaily\b",
        "weekly": r"\bweekly\b",
        "monthly": r"\bmonthly\b",
    }
    for hint, pattern in schedule_patterns.items():
        if re.search(pattern, lower):
            cs.schedule_hint = hint
            break
    cron_match = re.search(r"cron[:\s]+([^\s]+(?:\s+[^\s]+){4})", lower)
    if cron_match:
        cs.schedule_hint = f"cron:{cron_match.group(1)}"

    return cs


def _is_meaningful(cs: ConstraintSet) -> bool:
    return bool(
        cs.sections
        or cs.min_word_count
        or cs.max_word_count
        or cs.required_sources
        or cs.freshness_window_days
        or cs.delivery_channel
        or cs.output_format
        or cs.schedule_hint
        or cs.fail_closed_conditions
        or cs.custom
    )


def constraint_set_to_dict(cs: ConstraintSet) -> dict:
    return {
        "sections": cs.sections,
        "min_word_count": cs.min_word_count,
        "max_word_count": cs.max_word_count,
        "required_sources": cs.required_sources,
        "freshness_window_days": cs.freshness_window_days,
        "delivery_channel": cs.delivery_channel,
        "output_format": cs.output_format,
        "schedule_hint": cs.schedule_hint,
        "fail_closed_conditions": cs.fail_closed_conditions,
        "custom": cs.custom,
    }


def constraint_set_from_dict(data: dict) -> ConstraintSet:
    return ConstraintSet(
        sections=data.get("sections", []),
        min_word_count=data.get("min_word_count"),
        max_word_count=data.get("max_word_count"),
        required_sources=data.get("required_sources"),
        freshness_window_days=data.get("freshness_window_days"),
        delivery_channel=data.get("delivery_channel"),
        output_format=data.get("output_format"),
        schedule_hint=data.get("schedule_hint"),
        fail_closed_conditions=data.get("fail_closed_conditions", []),
        custom=data.get("custom", {}),
    )


def validate_constraints(cs: ConstraintSet) -> list[str]:
    errors = []
    if cs.min_word_count and cs.max_word_count:
        if cs.min_word_count > cs.max_word_count:
            errors.append("min_word_count exceeds max_word_count")
    if cs.required_sources is not None and cs.required_sources < 0:
        errors.append("required_sources cannot be negative")
    if cs.freshness_window_days is not None and cs.freshness_window_days < 0:
        errors.append("freshness_window_days cannot be negative")
    _KNOWN_DELIVERY_CHANNELS = {"email", "telegram", "slack", "webhook"}
    if cs.delivery_channel and cs.delivery_channel not in _KNOWN_DELIVERY_CHANNELS:
        errors.append(f"unknown delivery_channel: {cs.delivery_channel}")
    _KNOWN_OUTPUT_FORMATS = {"pdf", "html", "markdown", "json", "csv", "xlsx"}
    if cs.output_format and cs.output_format not in _KNOWN_OUTPUT_FORMATS:
        errors.append(f"unknown output_format: {cs.output_format}")
    return errors
