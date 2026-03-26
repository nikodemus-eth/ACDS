"""Base classes for the Tool Adapter Framework.

ToolContext: execution context passed to each adapter
ToolResult: structured output from adapter execution
ToolAdapter: abstract base class all adapters implement
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ToolContext:
    """Execution context for a tool adapter invocation."""

    run_id: str
    swarm_id: str
    action: dict
    workspace_root: Path
    repo: Any
    prior_results: dict
    config: dict
    inference: Any = None  # InferenceProvider — routes through ACDS when available


@dataclass
class ToolResult:
    """Structured output from a tool adapter execution."""

    success: bool
    output_data: dict
    artifacts: list[str]
    error: str | None
    metadata: dict
    warnings: list[str] = field(default_factory=list)


class ToolAdapter(ABC):
    """Abstract base class for all tool adapters.

    Subclasses must implement:
        tool_name: property returning the registered tool name
        execute: the actual tool logic
    """

    @property
    @abstractmethod
    def tool_name(self) -> str:
        """Return the tool_name matching the tool_registry entry."""
        ...

    @abstractmethod
    def execute(self, ctx: ToolContext) -> ToolResult:
        """Execute the tool with the given context."""
        ...

    def validate_inputs(self, ctx: ToolContext) -> list[str]:
        """Validate inputs before execution. Return list of error strings."""
        return []

    @staticmethod
    def find_prior_output(ctx: ToolContext, key: str) -> Any:
        """Search prior_results for a key across all upstream steps."""
        for step_output in ctx.prior_results.values():
            if isinstance(step_output, dict) and key in step_output:
                return step_output[key]
        return None
