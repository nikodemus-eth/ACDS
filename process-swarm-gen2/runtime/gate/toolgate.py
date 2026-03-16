"""ToolGate: Default-deny capability mediator for the M4 sovereign runtime.

ToolGate is the security boundary that enforces capability leases.
All capabilities are denied by default. A valid, active lease is the
only mechanism that can enable capabilities.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class Capability(str, Enum):
    """Runtime capability types."""
    FILESYSTEM_READ = "FILESYSTEM_READ"
    FILESYSTEM_WRITE = "FILESYSTEM_WRITE"
    TEST_EXECUTION = "TEST_EXECUTION"
    ARTIFACT_GENERATION = "ARTIFACT_GENERATION"
    REPOSITORY_MODIFICATION = "REPOSITORY_MODIFICATION"


@dataclass
class CapabilityDecision:
    """Result of a capability authorization check."""
    allowed: bool
    capability: str
    target_path: str
    reason: str


class ToolGate:
    """Default-deny capability mediator.

    All capabilities are denied unless a valid lease is bound.
    """

    # Explicit mapping from capability enum to lease key names (Lesson 3)
    CAP_MAP = {
        "FILESYSTEM_READ": "filesystem",
        "FILESYSTEM_WRITE": "filesystem",
        "TEST_EXECUTION": "test_execution",
        "ARTIFACT_GENERATION": "artifact_generation",
        "REPOSITORY_MODIFICATION": "repository_modification",
    }

    def __init__(self):
        self._lease: Optional[dict] = None
        self._granted_capabilities: dict = {}
        self._allowed_paths: list = []
        self._denied_capabilities: dict = {}

    def bind_lease(self, lease: dict) -> None:
        """Bind a validated lease. Only way to enable capabilities."""
        status = lease.get("revocation_status", "")
        if status != "active":
            raise ValueError(
                f"Cannot bind lease with status '{status}': expected 'active'"
            )

        valid, reason = self._check_time_bounds(lease)
        if not valid:
            raise ValueError(f"Cannot bind expired lease: {reason}")

        self._lease = lease
        self._granted_capabilities = lease.get("granted_capabilities", {})
        self._denied_capabilities = lease.get("denied_capabilities", {})
        self._allowed_paths = (
            lease.get("scope_constraints", {}).get("allowed_paths", [])
        )

    def unbind(self) -> None:
        """Remove any bound lease. Returns to default-deny."""
        self._lease = None
        self._granted_capabilities = {}
        self._allowed_paths = []
        self._denied_capabilities = {}

    def authorize(self, capability: str, target_path: str = "") -> bool:
        """Check if a capability is authorized for the given path."""
        decision = self.request_capability(capability, target_path)
        return decision.allowed

    def request_capability(
        self, capability: str, target_path: str = ""
    ) -> CapabilityDecision:
        """Request a capability authorization with detailed decision info."""
        if self._lease is None:
            return CapabilityDecision(
                allowed=False,
                capability=capability,
                target_path=target_path,
                reason="No lease bound (default deny)",
            )

        valid, time_reason = self._check_time_bounds(self._lease)
        if not valid:
            self.unbind()
            return CapabilityDecision(
                allowed=False,
                capability=capability,
                target_path=target_path,
                reason=f"Lease expired: {time_reason}",
            )

        denied_key = self.CAP_MAP.get(capability, capability.lower())
        if self._denied_capabilities.get(denied_key, False):
            return CapabilityDecision(
                allowed=False,
                capability=capability,
                target_path=target_path,
                reason=f"Capability '{capability}' is explicitly denied",
            )

        if not self._is_capability_granted(capability):
            return CapabilityDecision(
                allowed=False,
                capability=capability,
                target_path=target_path,
                reason=f"Capability '{capability}' not granted by lease",
            )

        if capability in (
            Capability.FILESYSTEM_READ,
            Capability.FILESYSTEM_WRITE,
            Capability.REPOSITORY_MODIFICATION,
        ):
            if not target_path:
                return CapabilityDecision(
                    allowed=False,
                    capability=capability,
                    target_path=target_path,
                    reason="Filesystem operations require a target path",
                )
            if not self._path_in_scope(target_path):
                return CapabilityDecision(
                    allowed=False,
                    capability=capability,
                    target_path=target_path,
                    reason=f"Path '{target_path}' outside lease scope",
                )

        return CapabilityDecision(
            allowed=True,
            capability=capability,
            target_path=target_path,
            reason="Authorized by lease",
        )

    def _is_capability_granted(self, capability: str) -> bool:
        """Check if a capability is granted by the current lease."""
        lease_key = self.CAP_MAP.get(capability)
        if lease_key is None:
            return False

        cap_config = self._granted_capabilities.get(lease_key)
        if cap_config is None:
            return False

        if capability == "FILESYSTEM_WRITE":
            return cap_config.get("write", False)

        if isinstance(cap_config, dict):
            return cap_config.get("allowed", True)

        return bool(cap_config)

    def _path_in_scope(self, target_path: str) -> bool:
        """Check if a path is within the lease's allowed scope."""
        if not self._allowed_paths:
            return False

        fs_config = self._granted_capabilities.get("filesystem", {})
        fs_paths = fs_config.get("allowed_paths", [])
        all_paths = list(set(self._allowed_paths + fs_paths))

        for allowed in all_paths:
            allowed_norm = allowed.rstrip("/")
            target_norm = target_path.rstrip("/")
            if (
                target_norm == allowed_norm
                or target_norm.startswith(allowed_norm + "/")
            ):
                return True

        return False

    @staticmethod
    def _check_time_bounds(lease: dict) -> tuple:
        """Check if a lease is within its valid time window."""
        now = datetime.now(timezone.utc)

        valid_from_str = lease.get("valid_from")
        if valid_from_str:
            valid_from = datetime.fromisoformat(valid_from_str)
            if now < valid_from:
                return False, "Lease not yet valid"

        expires_at_str = lease.get("expires_at")
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str)
            if now > expires_at:
                return False, "Lease has expired"

        return True, "Within time bounds"
