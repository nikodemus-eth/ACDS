"""DSL data models for behavior definitions.

Defines the core types used by the DSL parser and validator:
- OperationType: the five permitted file/test operations
- DslStep: a single step in a behavior sequence
- DslConstraints: resource limits for execution
- DslAcceptanceTest: post-execution verification
- DslMetadata: versioning and traceability
- DslDefinition: the top-level container
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Optional


class OperationType(enum.Enum):
    """Permitted operations in a behavior sequence."""

    CREATE = "create"
    MODIFY = "modify"
    APPEND = "append"
    DELETE = "delete"
    RUN_TEST = "run_test"


@dataclass
class DslStep:
    """A single step in a behavior sequence."""

    op: OperationType
    path: Optional[str] = None
    content: Optional[str] = None
    command: Optional[str] = None
    expected_exit_code: int = 0

    def is_file_operation(self) -> bool:
        return self.op in (
            OperationType.CREATE,
            OperationType.MODIFY,
            OperationType.APPEND,
            OperationType.DELETE,
        )

    def is_test_operation(self) -> bool:
        return self.op == OperationType.RUN_TEST


@dataclass
class DslConstraints:
    """Resource limits for execution."""

    max_files_modified: Optional[int] = None
    allowed_operations: Optional[list[str]] = None
    execution_timeout: Optional[int] = None


@dataclass
class DslAcceptanceTest:
    """Post-execution verification test."""

    test_id: str
    command: str
    expected_exit_code: int = 0


@dataclass
class DslMetadata:
    """Versioning and traceability metadata."""

    version: int = 1
    sequence_id: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class DslDefinition:
    """Top-level container for a parsed DSL document."""

    steps: list[DslStep] = field(default_factory=list)
    metadata: DslMetadata = field(default_factory=DslMetadata)
    constraints: DslConstraints = field(default_factory=DslConstraints)
    acceptance_tests: list[DslAcceptanceTest] = field(default_factory=list)

    @property
    def file_operations(self) -> list[DslStep]:
        return [s for s in self.steps if s.is_file_operation()]

    @property
    def test_operations(self) -> list[DslStep]:
        return [s for s in self.steps if s.is_test_operation()]

    @property
    def target_paths(self) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for s in self.steps:
            if s.path and s.path not in seen:
                seen.add(s.path)
                result.append(s.path)
        return result
