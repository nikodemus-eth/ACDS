"""Governed executor for the M4 sovereign runtime.

Performs the operations described in execution plans under ToolGate enforcement.
All operations are recorded regardless of outcome.

Supported operations: create, modify, delete, append, run_test
"""

from __future__ import annotations

import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from runtime.gate.toolgate import ToolGate


class Executor:
    """Governed operation executor.

    All operations pass through ToolGate authorization.
    Failed authorization halts execution and records partial results.
    """

    # Shell metacharacters that indicate injection attempts
    _SHELL_INJECTION_PATTERNS = [
        ";", "&&", "||", "|", "`", "$(", "${",
        "\n", "\r", "<(", ">(", ">>",
    ]

    def __init__(
        self,
        toolgate: ToolGate,
        workspace_dir: Path,
        test_timeout: int = 30,
    ):
        self.toolgate = toolgate
        self.workspace_dir = workspace_dir
        self.test_timeout = test_timeout

    def execute(self, plan: dict, lease: dict) -> dict:
        """Execute all steps in an execution plan."""
        actions = []
        artifacts_generated = []
        acceptance_results = []
        halted = False

        steps = plan.get("steps", [])
        modification_steps = [s for s in steps if s.get("operation") != "run_test"]
        test_steps = [s for s in steps if s.get("operation") == "run_test"]

        for step in modification_steps:
            if halted:
                actions.append(self._skip_action(step))
                continue

            action = self._execute_step(step)
            actions.append(action)

            if action["status"] == "failed":
                halted = True

            if action["status"] == "completed" and step.get("operation") in (
                "create", "modify", "append",
            ):
                artifacts_generated.append(action.get("path", ""))

        for step in test_steps:
            if halted:
                acceptance_results.append({
                    "test_id": step.get("step_id", ""),
                    "passed": False,
                    "output": "Skipped due to earlier failure",
                })
                continue

            result = self._run_test(step)
            acceptance_results.append(result)

            if not result["passed"]:
                halted = True

        if halted:
            any_completed = any(a["status"] == "completed" for a in actions)
            execution_status = "partial" if any_completed else "failed"
        else:
            execution_status = "completed"

        return {
            "actions": actions,
            "artifacts_generated": artifacts_generated,
            "acceptance_results": acceptance_results,
            "execution_status": execution_status,
        }

    def _execute_step(self, step: dict) -> dict:
        """Execute a single modification step."""
        operation = step.get("operation", "")
        path = step.get("path", "")
        content = step.get("content", "")
        capability = step.get("required_capability", "FILESYSTEM_WRITE")

        # Resolve path and enforce containment (Lesson: path resolution before check)
        target = (self.workspace_dir / path).resolve() if path else self.workspace_dir
        workspace_resolved = self.workspace_dir.resolve()

        if not str(target).startswith(str(workspace_resolved)):
            return self._failed_action(
                step, f"Path traversal blocked: '{path}' resolves outside workspace"
            )

        decision = self.toolgate.request_capability(capability, path)
        if not decision.allowed:
            return {
                "action_id": str(uuid.uuid4()),
                "step_id": step.get("step_id", ""),
                "operation": operation,
                "path": path,
                "status": "failed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "detail": f"ToolGate denied: {decision.reason}",
            }

        try:
            if operation == "create":
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            elif operation == "modify":
                if not target.exists():
                    return self._failed_action(step, f"File does not exist: {path}")
                target.write_text(content)
            elif operation == "delete":
                if target.exists():
                    target.unlink()
            elif operation == "append":
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(target, "a") as f:
                    f.write(content)
            else:
                return self._failed_action(step, f"Unknown operation: {operation}")

            return {
                "action_id": str(uuid.uuid4()),
                "step_id": step.get("step_id", ""),
                "operation": operation,
                "path": path,
                "status": "completed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "detail": "OK",
            }

        except Exception as e:
            return self._failed_action(step, str(e))

    def _run_test(self, step: dict) -> dict:
        """Run an acceptance test command."""
        command = step.get("path", "")
        test_id = step.get("step_id", "")

        for pattern in self._SHELL_INJECTION_PATTERNS:
            if pattern in command:
                return {
                    "test_id": test_id,
                    "passed": False,
                    "output": f"Blocked: shell metacharacter '{pattern}' in test command",
                }

        decision = self.toolgate.request_capability("TEST_EXECUTION", "")
        if not decision.allowed:
            return {
                "test_id": test_id,
                "passed": False,
                "output": f"ToolGate denied: {decision.reason}",
            }

        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=self.test_timeout,
                cwd=str(self.workspace_dir),
            )
            return {
                "test_id": test_id,
                "passed": result.returncode == 0,
                "output": result.stdout[:1000] if result.stdout else result.stderr[:1000],
            }
        except subprocess.TimeoutExpired:
            return {
                "test_id": test_id,
                "passed": False,
                "output": f"Test timed out after {self.test_timeout}s",
            }
        except Exception as e:
            return {
                "test_id": test_id,
                "passed": False,
                "output": str(e),
            }

    def _failed_action(self, step: dict, detail: str) -> dict:
        return {
            "action_id": str(uuid.uuid4()),
            "step_id": step.get("step_id", ""),
            "operation": step.get("operation", ""),
            "path": step.get("path", ""),
            "status": "failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "detail": detail,
        }

    def _skip_action(self, step: dict) -> dict:
        return {
            "action_id": str(uuid.uuid4()),
            "step_id": step.get("step_id", ""),
            "operation": step.get("operation", ""),
            "path": step.get("path", ""),
            "status": "skipped",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "detail": "Skipped due to earlier failure",
        }
