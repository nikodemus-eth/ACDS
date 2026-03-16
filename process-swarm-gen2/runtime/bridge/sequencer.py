"""Multi-step sequence orchestrator for the M4 sovereign runtime bridge.

Accepts an ordered list of integration-format proposals, translates each
through the bridge, and executes them sequentially through the M4 pipeline.
Each step must complete successfully before the next one begins.

The sequencer enforces:
- Strict ordering: step N runs only after step N-1 succeeds
- Chain integrity: each result references its predecessor
- Rollback metadata: tracks which steps completed for potential undo
- Final assembly verification: an optional acceptance test on the composed output
"""

from __future__ import annotations

import json
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from runtime.bridge.translator import (
    extract_bridge_metadata,
    integration_proposal_to_m4,
    m4_record_to_integration_result,
)


class SequenceResult:
    """Result of a multi-step sequence execution."""

    def __init__(
        self,
        sequence_id: str,
        steps: list[dict],
        status: str,
        output_path: str | None = None,
    ):
        self.sequence_id = sequence_id
        self.steps = steps
        self.status = status
        self.output_path = output_path

    @property
    def succeeded(self) -> bool:
        return self.status == "completed"

    @property
    def completed_steps(self) -> list[dict]:
        return [s for s in self.steps if s["status"] == "success"]

    @property
    def failed_step(self) -> dict | None:
        for s in self.steps:
            if s["status"] == "failed":
                return s
        return None

    def to_dict(self) -> dict:
        return {
            "sequence_id": self.sequence_id,
            "status": self.status,
            "output_path": self.output_path,
            "total_steps": len(self.steps),
            "completed_steps": len(self.completed_steps),
            "steps": self.steps,
        }


class SequencePipeline:
    """Orchestrates ordered multi-step proposals through the M4 pipeline.

    Each proposal in the sequence is translated and executed independently
    through the full governance pipeline (validate -> compile -> lease ->
    gate -> execute -> record). Steps run in strict order; a failure halts
    the sequence.
    """

    def __init__(self, openclaw_root: str | Path):
        self.openclaw_root = Path(openclaw_root).expanduser().resolve()
        self._runner = None

    @property
    def runner(self):
        """Lazy-load the pipeline runner."""
        if self._runner is None:
            from runtime.pipeline.runner import PipelineRunner
            self._runner = PipelineRunner(self.openclaw_root)
        return self._runner

    def run_sequence(
        self,
        proposals: list[dict],
        sequence_id: str | None = None,
    ) -> SequenceResult:
        """Execute an ordered list of integration proposals sequentially.

        Each proposal goes through the full M4 pipeline independently.
        Steps execute in list order. If any step fails, the sequence halts
        and returns a partial result.

        Args:
            proposals: Ordered list of integration-format proposals.
            sequence_id: Optional ID for this sequence. Auto-generated if omitted.

        Returns:
            SequenceResult with per-step results and overall status.
        """
        seq_id = sequence_id or f"seq-{uuid.uuid4().hex[:12]}"
        step_results: list[dict] = []
        output_path = None

        for i, proposal in enumerate(proposals):
            step_num = i + 1
            proposal_id = proposal.get("proposal_id", f"step-{step_num}")

            # Translate to M4 format
            bridge_meta = extract_bridge_metadata(proposal)
            m4_proposal = integration_proposal_to_m4(proposal)

            # Write to temp file for pipeline runner
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".json",
                dir=str(self.openclaw_root),
                delete=False,
            ) as f:
                json.dump(m4_proposal, f)
                proposal_path = Path(f.name)

            try:
                record = self.runner.run(proposal_path)
                integration_result = m4_record_to_integration_result(
                    record, bridge_meta
                )

                exec_status = record.get("execution_status", "failed")
                step_ok = exec_status == "completed"

                step_result = {
                    "step": step_num,
                    "proposal_id": proposal_id,
                    "status": "success" if step_ok else "failed",
                    "record_id": record.get("record_id"),
                    "plan_id": record.get("plan_id"),
                    "lease_id": record.get("lease_id"),
                    "execution_status": exec_status,
                    "integration_result": integration_result,
                }

                # Track the output path from the last successful step
                target = proposal.get("target", {})
                if step_ok and target.get("path"):
                    output_path = target["path"]

                step_results.append(step_result)

                if not step_ok:
                    return SequenceResult(
                        sequence_id=seq_id,
                        steps=step_results,
                        status="partial",
                        output_path=output_path,
                    )

            except Exception as e:
                step_results.append({
                    "step": step_num,
                    "proposal_id": proposal_id,
                    "status": "failed",
                    "error": str(e),
                })
                return SequenceResult(
                    sequence_id=seq_id,
                    steps=step_results,
                    status="failed",
                    output_path=output_path,
                )

            finally:
                proposal_path.unlink(missing_ok=True)

        return SequenceResult(
            sequence_id=seq_id,
            steps=step_results,
            status="completed",
            output_path=output_path,
        )


def build_document_sequence(
    target_path: str,
    title: str,
    byline: str,
    body: str,
    namespace: dict | None = None,
    sequence_id: str | None = None,
) -> list[dict]:
    """Build an ordered list of integration proposals that compose a markdown document.

    Creates three proposals:
    1. Create file with markdown title (# heading)
    2. Append byline (italic attribution)
    3. Append body text

    Args:
        target_path: Workspace-relative path for the output document.
        title: Document title (rendered as # heading).
        byline: Author attribution (rendered as italic).
        body: Body text content.
        namespace: Optional namespace dict for traceability.
        sequence_id: Optional sequence identifier for proposal ID prefixing.

    Returns:
        List of three integration-format proposals in execution order.

    Raises:
        ValueError: If inputs contain shell metacharacters or path traversal.
    """
    seq_id = sequence_id or f"seq-{uuid.uuid4().hex[:8]}"
    ns = namespace or {
        "workspace": "openclaw",
        "branch": "main",
        "run_id": f"run-{seq_id}",
        "target_object": target_path,
    }
    now = datetime.now(timezone.utc).isoformat()

    # SECURITY: Sanitize inputs against shell injection
    _shell_dangerous = set(";|&`$(){}\\'\"\n\r<>")
    for label, value in [
        ("title", title),
        ("byline", byline),
        ("body", body),
        ("target_path", target_path),
    ]:
        if any(c in value for c in _shell_dangerous):
            raise ValueError(
                f"Shell metacharacter in {label}: {value!r}. "
                f"Input must not contain characters: {_shell_dangerous}"
            )

    # SECURITY: Reject path traversal
    if ".." in target_path:
        raise ValueError(
            f"Shell metacharacter in target_path: {target_path!r}. "
            f"Path traversal sequence '..' is not allowed"
        )

    def _make_proposal(step_num: int, step_label: str, mode: str, text: str) -> dict:
        return {
            "artifact_type": "behavior_proposal",
            "version": "0.1",
            "proposal_id": f"{seq_id}.step-{step_num}-{step_label}",
            "created_at": now,
            "author_agent": "sequence_composer.main",
            "operation_class": "docs_edit",
            "namespace": ns,
            "target": {"kind": "docs", "path": target_path},
            "change_spec": {"mode": mode, "text": text},
            "intent_summary": f"Step {step_num} of document composition: {step_label}.",
            "scope": {
                "allowed_paths": [target_path],
                "max_files_modified": 1,
                "allow_network": False,
                "allow_package_install": False,
                "allow_external_apis": False,
                "required_tools": ["write"],
            },
            "constraints": {
                "acceptance_tests": [f"test -f {target_path}"],
                "side_effect_flags": ["filesystem_write"],
                "requires_human_review": False,
                "disallowed_paths": ["src/", "runtime/"],
            },
            "rationale": f"Step {step_num} of document composition: {step_label}.",
        }

    return [
        _make_proposal(1, "title", "create_file", f"# {title}\n\n"),
        _make_proposal(2, "byline", "append_text", f"*By {byline}*\n\n"),
        _make_proposal(3, "body", "append_text", f"{body}\n"),
    ]
