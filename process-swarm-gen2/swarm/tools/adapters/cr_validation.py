"""Context Report Stage 6 — Validation via Ollama (primary) + Apple Intelligence (fallback).

Engine: Ollama (Primary) + Apple Intelligence (Fallback)

Ollama Responsibilities:
    - Word count enforcement
    - Section presence
    - Structural validation

Apple Intelligence Responsibilities (Fallback):
    - Tone correction
    - Logical consistency checks
    - Final refinement if validation fails

Input: synthesized report text and sections
Output: validation result with pass/fail and any corrections
"""
from __future__ import annotations

import json
import time

from swarm.tools.base import ToolAdapter, ToolContext, ToolResult
from swarm.tools.inference_engines import AppleIntelligenceClient, OllamaClient


_REQUIRED_SECTIONS = (
    "Executive Summary",
    "Technical Intelligence",
    "Governance & Policy",
    "Market Intelligence",
    "Recommendations",
)

_MIN_REPORT_CHARS = 500
_MAX_REPORT_CHARS = 50000
_MIN_SECTION_CHARS = 50

_VALIDATION_SYSTEM = (
    "You are a report validation engine. Check the following report for: "
    "1) All required sections present "
    "2) Each section has substantive content (not just headers) "
    "3) No obvious hallucinations or unsupported claims "
    "4) Professional tone "
    'Return ONLY valid JSON with: "valid" (boolean), '
    '"issues" (list of issue strings), '
    '"section_status" (object mapping section name to "pass" or "fail").'
)

_REFINEMENT_SYSTEM = (
    "You are a report refinement engine. Fix the following issues in "
    "the report while preserving all factual content. Make minimal "
    "changes — only fix the identified issues. Return the corrected "
    "full report text."
)


class CRValidationAdapter(ToolAdapter):
    """Validates and optionally refines the synthesized report."""

    @property
    def tool_name(self) -> str:
        return "cr_validation"

    def execute(self, ctx: ToolContext) -> ToolResult:
        t0 = time.monotonic()

        report_text = self.find_prior_output(ctx, "report_text") or ""
        sections = self.find_prior_output(ctx, "sections") or {}

        if not report_text:
            return ToolResult(
                success=False,
                output_data={},
                artifacts=[],
                error="No report text to validate",
                metadata={"duration_ms": 0},
            )

        issues: list[str] = []
        section_status: dict[str, str] = {}

        # ── Structural validation (deterministic, no LLM needed) ──
        char_count = len(report_text)
        if char_count < _MIN_REPORT_CHARS:
            issues.append(
                f"Report too short: {char_count} chars (min {_MIN_REPORT_CHARS})"
            )
        if char_count > _MAX_REPORT_CHARS:
            issues.append(
                f"Report too long: {char_count} chars (max {_MAX_REPORT_CHARS})"
            )

        # Check required sections
        report_lower = report_text.lower()
        for req in _REQUIRED_SECTIONS:
            # Check if section header exists (fuzzy match)
            found = any(
                req.lower() in name.lower()
                for name in sections
            ) or req.lower() in report_lower
            if found:
                section_status[req] = "pass"
            else:
                section_status[req] = "fail"
                issues.append(f"Missing required section: {req}")

        # Check section content length
        for name, content in sections.items():
            if len(content) < _MIN_SECTION_CHARS:
                issues.append(
                    f"Section '{name}' too short: {len(content)} chars "
                    f"(min {_MIN_SECTION_CHARS})"
                )

        # ── LLM validation via Ollama (primary) ──
        ollama = OllamaClient(
            default_model=ctx.config.get("model", "qwen3:8b"),
            timeout_seconds=ctx.config.get("timeout_seconds", 300),
        )

        validation_prompt = (
            f"Validate this report:\n\n{report_text[:8000]}\n\n"
            "Check for required sections, substantive content, "
            "hallucinations, and professional tone."
        )

        llm_result = ollama.generate(
            validation_prompt,
            system=_VALIDATION_SYSTEM,
            temperature=0.1,
        )

        llm_validation = None
        if llm_result.success:
            try:
                llm_validation = json.loads(llm_result.output.strip())
            except json.JSONDecodeError:
                llm_validation = _try_parse_json(llm_result.output)

        if llm_validation:
            llm_issues = llm_validation.get("issues", [])
            issues.extend(llm_issues)
            llm_section_status = llm_validation.get("section_status", {})
            for sec_name, status in llm_section_status.items():
                if status == "fail" and sec_name not in section_status:
                    section_status[sec_name] = "fail"

        # ── Determine if validation passes ──
        structural_pass = all(
            section_status.get(req) == "pass" for req in _REQUIRED_SECTIONS
        ) and char_count >= _MIN_REPORT_CHARS

        # ── Apple Intelligence fallback if validation fails ──
        refined_text = None
        fallback_used = False

        if not structural_pass and issues:
            apple = AppleIntelligenceClient(
                timeout_seconds=ctx.config.get("timeout_seconds", 180),
            )

            refinement_prompt = (
                f"The following report has these issues:\n"
                f"{json.dumps(issues, indent=2)}\n\n"
                f"REPORT:\n{report_text}\n\n"
                f"Fix the issues while preserving all factual content."
            )

            refine_result = apple.generate(
                refinement_prompt,
                system=_REFINEMENT_SYSTEM,
                temperature=0.3,
            )

            if refine_result.success and len(refine_result.output.strip()) > 100:
                refined_text = refine_result.output.strip()
                fallback_used = True

                # Write refined report
                refined_path = ctx.workspace_root / "output" / "context_report_refined.md"
                refined_path.parent.mkdir(parents=True, exist_ok=True)
                refined_path.write_text(refined_text)

        # Write validation artifact
        validation_output = {
            "valid": structural_pass or fallback_used,
            "issues": issues,
            "section_status": section_status,
            "char_count": char_count,
            "fallback_used": fallback_used,
            "refined": refined_text is not None,
        }
        artifact_path = ctx.workspace_root / "validation_output.json"
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(json.dumps(validation_output, indent=2))

        artifacts = [str(artifact_path)]

        latency = int((time.monotonic() - t0) * 1000)
        return ToolResult(
            success=True,
            output_data={
                "all_passed": structural_pass or fallback_used,
                "issues": issues,
                "section_status": section_status,
                "char_count": char_count,
                "fallback_used": fallback_used,
                "final_report_text": refined_text or report_text,
                "engine_primary": "ollama",
                "engine_fallback": "apple_intelligence" if fallback_used else None,
            },
            artifacts=artifacts,
            error=None,
            metadata={
                "duration_ms": latency,
                "engine": "ollama",
                "fallback_engine": "apple_intelligence" if fallback_used else None,
                "issue_count": len(issues),
                "structural_pass": structural_pass,
            },
        )


def _try_parse_json(text: str) -> dict | None:
    """Try to extract JSON from text that may have markdown wrapping."""
    for prefix in ("```json", "```"):
        if prefix in text:
            start = text.index(prefix) + len(prefix)
            end = text.find("```", start)
            if end > start:
                try:
                    return json.loads(text[start:end].strip())
                except json.JSONDecodeError:
                    pass
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass
    return None
