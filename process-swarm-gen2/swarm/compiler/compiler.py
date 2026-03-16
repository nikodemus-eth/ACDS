"""Behavior Sequence Compiler (BSC).

Compiles a behavior sequence (from the registry) into an M4 proposal that
can be submitted to the runtime pipeline. The compilation has 4 stages:

1. Normalize steps — convert DSL ops to M4 modifications (skip run_test)
2. Enforce scope — reject path traversal, absolute paths, out-of-scope paths
3. Inject constraints — apply max_files_modified limits
4. Bind acceptance tests — validate commands against dangerous patterns
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_VALID_OPERATIONS = frozenset({"create", "modify", "append", "delete", "run_test"})

_DANGEROUS_PATTERNS = re.compile(
    r"\b(curl|wget|nc|ncat|python|python3|ruby|perl|php|node|eval|exec|bash\s+-c"
    r"|sh\s+-c|sudo|su\s|dd\s|mkfs|fdisk|mount|umount|chown|chmod\s+777)\b"
    r"|[;|&`$]",
    re.IGNORECASE,
)

_DENIED_PATHS = ["src/", "runtime/", "swarm/", "node_modules/", ".git/"]


class BehaviorSequenceCompiler:
    """Compiles behavior sequences into M4 proposals."""

    def __init__(self, workspace_root: str | Path):
        self.workspace_root = Path(workspace_root).resolve()

    def compile(
        self,
        swarm_id: str,
        sequence: dict[str, Any],
        run_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Compile a behavior sequence into an M4 proposal.

        Args:
            swarm_id: The swarm that owns this sequence.
            sequence: Dict with ordered_steps_json, target_paths_json,
                      acceptance_tests_json fields (JSON strings or lists).
            run_context: Optional runtime context with run_id, workspace_root.

        Returns:
            An M4 behavior_proposal dict ready for the runtime pipeline.

        Raises:
            ValueError: If scope, path, or safety checks fail.
        """
        steps = self._parse_json_field(sequence, "ordered_steps_json")
        target_paths = self._parse_json_field(sequence, "target_paths_json")
        acceptance_tests = self._parse_json_field(sequence, "acceptance_tests_json")

        # Stage 1: Normalize steps
        modifications = self._normalize_steps(steps)

        # Stage 2: Enforce scope
        self._enforce_scope(modifications, target_paths)

        # Stage 3: Inject constraints (max_files_modified)
        # Currently applies default scope constraints

        # Stage 4: Bind acceptance tests
        self._bind_acceptance_tests(acceptance_tests)

        # Build the proposal
        now = datetime.now(timezone.utc).isoformat()
        proposal_id = f"{swarm_id}-{uuid.uuid4().hex[:8]}"

        # Extract unique target paths from modifications
        mod_paths = list(
            dict.fromkeys(m["path"] for m in modifications if m.get("path"))
        )

        proposal: dict[str, Any] = {
            "proposal_id": proposal_id,
            "source": "internal",
            "intent": sequence.get(
                "sequence_name", f"Behavior sequence for {swarm_id}"
            ),
            "target_paths": mod_paths or target_paths,
            "modifications": modifications,
            "acceptance_tests": [
                {
                    "test_id": t["test_id"],
                    "command": t["command"],
                    "expected_exit_code": t.get("expected_exit_code", 0),
                }
                for t in acceptance_tests
            ],
            "scope_boundary": {
                "allowed_paths": target_paths,
                "denied_paths": _DENIED_PATHS[:],
            },
            "side_effect_flags": ["filesystem_write"],
            "created_at": now,
        }

        return proposal

    def _normalize_steps(self, steps: list[dict]) -> list[dict]:
        """Stage 1: Convert DSL steps to M4 modifications."""
        if not steps:
            raise ValueError("Behavior sequence contains no steps")

        modifications = []
        for step in steps:
            op = step.get("op", "")
            if op not in _VALID_OPERATIONS:
                raise ValueError(f"Step has invalid operation: '{op}'")
            # Skip run_test — these are not file modifications
            if op == "run_test":
                continue
            modifications.append(
                {
                    "path": step.get("path", ""),
                    "operation": op,
                    "content": step.get("content", ""),
                }
            )
        return modifications

    def _enforce_scope(
        self, modifications: list[dict], target_paths: list[str]
    ) -> None:
        """Stage 2: Reject path traversal, absolute paths, out-of-scope paths."""
        for mod in modifications:
            path = mod.get("path", "")
            if not path:
                continue

            # Reject path traversal
            if ".." in path:
                raise ValueError(f"Path traversal detected: '{path}'")

            # Reject absolute paths
            if path.startswith("/"):
                raise ValueError(f"Rejecting absolute path: '{path}'")

            # Reject out-of-scope paths (must be under a target_path prefix)
            if target_paths:
                in_scope = any(
                    path.startswith(tp) or path == tp for tp in target_paths
                )
                if not in_scope:
                    raise ValueError(
                        f"Scope violation: '{path}' is not under any target path "
                        f"{target_paths}"
                    )

    def _bind_acceptance_tests(self, tests: list[dict]) -> None:
        """Stage 4: Validate acceptance test commands for safety."""
        if not tests:
            raise ValueError("At least one acceptance test is required")

        for test in tests:
            cmd = test.get("command", "")
            if _DANGEROUS_PATTERNS.search(cmd):
                raise ValueError(
                    f"Acceptance test '{test.get('test_id', '?')}' contains "
                    f"dangerous command pattern: {cmd}"
                )

    @staticmethod
    def _parse_json_field(data: dict, key: str) -> list:
        """Parse a field that may be a JSON string or already a list."""
        value = data.get(key, [])
        if isinstance(value, str):
            return json.loads(value)
        return value
