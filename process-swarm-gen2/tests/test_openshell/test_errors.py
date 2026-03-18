"""Tests for swarm.openshell.errors — error subclass attributes."""

from __future__ import annotations

from swarm.openshell.errors import (
    OpenShellError,
    PolicyDeniedError,
    ScopeViolationError,
    ValidationError,
)
from swarm.openshell.models import PolicyDecision


class TestValidationError:
    """Tests for ValidationError."""

    def test_validation_error_stores_errors(self):
        e = ValidationError("msg", ["e1", "e2"])
        assert e.validation_errors == ["e1", "e2"]
        assert str(e) == "msg"

    def test_validation_error_empty_list(self):
        e = ValidationError("no errors", [])
        assert e.validation_errors == []
        assert str(e) == "no errors"


class TestPolicyDeniedError:
    """Tests for PolicyDeniedError."""

    def test_policy_denied_error_stores_decision(self):
        decision = PolicyDecision(
            allowed=False,
            decision="deny",
            reason="Blocked by rule",
            matched_rule="block_all",
        )
        e = PolicyDeniedError("denied", decision)
        assert e.decision is decision
        assert e.decision.allowed is False
        assert e.decision.reason == "Blocked by rule"
        assert e.decision.matched_rule == "block_all"

    def test_policy_denied_error_message(self):
        decision = PolicyDecision(
            allowed=False,
            decision="deny",
            reason="test",
            matched_rule="r1",
        )
        e = PolicyDeniedError("access denied", decision)
        assert str(e) == "access denied"


class TestScopeViolationError:
    """Tests for ScopeViolationError."""

    def test_scope_violation_error_stores_violations(self):
        violations = ["/etc/passwd", "evil.example.com"]
        e = ScopeViolationError("out of scope", violations)
        assert e.violations == ["/etc/passwd", "evil.example.com"]
        assert str(e) == "out of scope"

    def test_scope_violation_error_inherits_openshell_error(self):
        e = ScopeViolationError("bad scope", ["v1"])
        try:
            raise e
        except OpenShellError as caught:
            assert caught is e
            assert caught.violations == ["v1"]
