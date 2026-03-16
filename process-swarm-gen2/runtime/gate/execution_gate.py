"""Execution gate for the M4 sovereign runtime.

The execution gate is the primary safety boundary.
It verifies the full trust chain before allowing execution.

9-check verification chain:
1. Plan signature valid
2. Validation result signature valid
3. Referential integrity (proposal_id)
4. Referential integrity (validation_id)
5. Lease validity (not expired/revoked)
6. Lease plan binding
7. Capability coverage
8. Scope alignment
9. Lease signature valid
10. Validation status == "passed"
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from runtime.identity.signer import verify_attached_signature
from runtime.lease.lease_manager import check_lease_validity


@dataclass
class GateDecision:
    """Result of execution gate verification."""
    allowed: bool
    reasons: list = field(default_factory=list)


class ExecutionGate:
    """Execution gate that verifies the full trust chain."""

    # Explicit capability-to-lease key mapping (Lesson 3)
    CAP_MAP = {
        "FILESYSTEM_WRITE": "filesystem",
        "FILESYSTEM_READ": "filesystem",
        "TEST_EXECUTION": "test_execution",
        "ARTIFACT_GENERATION": "artifact_generation",
        "REPOSITORY_MODIFICATION": "repository_modification",
    }

    def check(
        self,
        plan: dict,
        validation_result: dict,
        lease: dict,
        keys_dir: Path,
    ) -> GateDecision:
        """Run all gate checks against the execution artifacts."""
        failures = []

        # 1. Plan signature
        if plan.get("signature"):
            if not verify_attached_signature(plan, keys_dir):
                failures.append("Plan signature verification failed")
        else:
            failures.append("Plan is unsigned")

        # 2. Validation result signature
        if validation_result.get("signature"):
            if not verify_attached_signature(validation_result, keys_dir):
                failures.append("Validation result signature verification failed")
        else:
            failures.append("Validation result is unsigned")

        # 3. Referential integrity: proposal_id
        plan_proposal = plan.get("proposal_id")
        val_proposal = validation_result.get("proposal_id")
        if plan_proposal != val_proposal:
            failures.append(
                f"Proposal ID mismatch: plan has '{plan_proposal}', "
                f"validation has '{val_proposal}'"
            )

        # 4. Referential integrity: validation_id
        plan_validation = plan.get("validation_id")
        val_id = validation_result.get("validation_id")
        if plan_validation != val_id:
            failures.append(
                f"Validation ID mismatch: plan references '{plan_validation}', "
                f"validation has '{val_id}'"
            )

        # 5. Lease validity
        lease_valid, lease_reason = check_lease_validity(lease)
        if not lease_valid:
            failures.append(f"Lease invalid: {lease_reason}")

        # 6. Lease plan binding
        lease_plan = lease.get("execution_plan_id")
        plan_id = plan.get("plan_id")
        if lease_plan != plan_id:
            failures.append(
                f"Lease plan binding mismatch: lease binds to "
                f"'{lease_plan}', plan is '{plan_id}'"
            )

        # 7. Capability coverage
        required_caps = set(plan.get("required_capabilities", []))
        granted = lease.get("granted_capabilities", {})
        denied = lease.get("denied_capabilities", {})

        for cap in required_caps:
            lease_key = self.CAP_MAP.get(cap)
            if lease_key is None:
                failures.append(f"Unknown capability: {cap}")
                continue

            if lease_key not in granted:
                failures.append(
                    f"Required capability '{cap}' not granted by lease"
                )

            if denied.get(lease_key, False):
                failures.append(
                    f"Required capability '{cap}' is explicitly denied"
                )

        # 8. Scope alignment
        plan_paths = set(
            plan.get("scope_constraints", {}).get("allowed_paths", [])
        )
        lease_paths = set(
            lease.get("scope_constraints", {}).get("allowed_paths", [])
        )

        if plan_paths and lease_paths:
            for pp in plan_paths:
                if not any(
                    pp == lp or pp.startswith(lp.rstrip("/") + "/")
                    for lp in lease_paths
                ):
                    failures.append(
                        f"Plan scope path '{pp}' not covered by lease scope"
                    )

        # 9. Lease signature
        if lease.get("signature"):
            if not verify_attached_signature(lease, keys_dir):
                failures.append("Lease signature verification failed")
        else:
            failures.append("Lease is unsigned")

        # 10. Validation status
        if validation_result.get("status") != "passed":
            failures.append(
                f"Validation status is '{validation_result.get('status')}', "
                f"expected 'passed'"
            )

        return GateDecision(
            allowed=len(failures) == 0,
            reasons=failures if failures else ["All checks passed"],
        )
