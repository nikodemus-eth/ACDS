"""Action Compiler — converts action tables to behavior sequence steps.

Maps action entries to either file-system operations (create, modify, etc.)
or capability-layer invocations (invoke_capability) based on the action type
and associated tool.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


_FILE_OP_MAP: dict[str, str] = {
    "file_create": "create",
    "file_modify": "modify",
    "file_append": "append",
    "file_delete": "delete",
    "test_run": "run_test",
}

_FS_TOOLS = frozenset({
    "write", "read", "edit", "delete", "append",
    "file_write", "file_read", "file_edit", "file_delete", "file_append",
})


@dataclass
class CompilationResult:
    """Result of compiling an action table to behavior steps."""

    success: bool
    plan_id: str
    steps: list[dict[str, Any]] = field(default_factory=list)
    execution_mode: str = "sequential"
    error: Optional[str] = None
    unmapped_actions: list[str] = field(default_factory=list)


class ActionCompiler:
    """Compiles action table entries into behavior sequence steps."""

    def __init__(self, adapter_registry: Any = None):
        self.adapter_registry = adapter_registry

    def compile(
        self,
        action_entries: list[dict[str, Any]],
        context: dict[str, Any] | None = None,
    ) -> CompilationResult:
        """Compile action entries into behavior steps.

        Each action is classified as either a file-system operation
        (mapped via _FILE_OP_MAP) or a capability-layer invocation.

        Args:
            action_entries: List of action entry dicts with action_type,
                           tool_name, parameters, etc.
            context: Optional compilation context.

        Returns:
            CompilationResult with compiled steps.
        """
        plan_id = f"plan-{uuid.uuid4().hex[:12]}"
        steps: list[dict[str, Any]] = []
        unmapped: list[str] = []

        for entry in action_entries:
            action_type = entry.get("action_type", "")
            tool_name = entry.get("tool_name", "")
            params = entry.get("parameters", {})

            # Check if this is a file-system operation
            fs_op = _FILE_OP_MAP.get(action_type)
            if fs_op:
                steps.append({
                    "op": fs_op,
                    "path": params.get("path", ""),
                    "content": params.get("content", ""),
                    "command": params.get("command"),
                })
            elif tool_name in _FS_TOOLS:
                # Tool is filesystem-related, infer operation
                steps.append({
                    "op": "modify",
                    "path": params.get("path", ""),
                    "content": params.get("content", ""),
                })
            else:
                # Capability-layer invocation
                steps.append({
                    "op": "invoke_capability",
                    "tool_name": tool_name,
                    "action_type": action_type,
                    "parameters": params,
                })
                if not tool_name:
                    unmapped.append(
                        entry.get("action_id", f"unknown-{len(unmapped)}")
                    )

        return CompilationResult(
            success=len(unmapped) == 0,
            plan_id=plan_id,
            steps=steps,
            unmapped_actions=unmapped,
        )

    def compile_to_behavior_steps(
        self,
        action_entries: list[dict[str, Any]],
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Convenience: compile and return just the steps list."""
        result = self.compile(action_entries, context)
        return result.steps
