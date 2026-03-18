"""Stage 3 -- PolicyEngine: default-deny authorisation for OpenShell commands.

Rules are evaluated in strict order; the first matching rule wins:

1. ``PRIVILEGED`` side-effect level  --> always **DENY**.
2. Numeric side-effect level exceeds ``config.max_privilege_level`` --> **DENY**.
3. ``EXTERNAL_ACTION`` with no ``allowed_hosts`` configured --> **DENY**.
4. Everything else --> **ALLOW** (with constraints carried from the spec).
"""

from __future__ import annotations

from swarm.openshell.config import OpenShellConfig
from swarm.openshell.models import (
    CommandEnvelope,
    PolicyDecision,
    SideEffectLevel,
)

# Mapping from enum member to numeric severity for ordered comparison.
_LEVEL_ORDER: dict[SideEffectLevel, int] = {
    SideEffectLevel.READ_ONLY: 1,
    SideEffectLevel.CONTROLLED_GENERATION: 2,
    SideEffectLevel.LOCAL_MUTATION: 3,
    SideEffectLevel.EXTERNAL_ACTION: 4,
    SideEffectLevel.PRIVILEGED: 5,
}


class PolicyEngine:
    """Default-deny policy engine for OpenShell commands."""

    def __init__(self, config: OpenShellConfig) -> None:
        self.config = config

    def evaluate(self, envelope: CommandEnvelope, spec: dict) -> PolicyDecision:
        """Evaluate whether a command should be allowed to execute.

        Parameters
        ----------
        envelope:
            The normalised command envelope.
        spec:
            The command specification dict (used to propagate
            constraints into the decision).

        Returns
        -------
        PolicyDecision
            Contains the boolean ``allowed`` flag, a human-readable
            ``reason``, and any ``constraints`` inherited from the spec.
        """
        level = envelope.side_effect_level
        numeric = _LEVEL_ORDER.get(level, 5)

        # Rule 1: PRIVILEGED commands are unconditionally denied.
        if level is SideEffectLevel.PRIVILEGED:
            return PolicyDecision(
                allowed=False,
                decision="deny",
                reason=(
                    f"Command '{envelope.command_name}' has side-effect level "
                    f"PRIVILEGED which is unconditionally denied."
                ),
                matched_rule="privileged_deny",
            )

        # Rule 2: side-effect level exceeds configured ceiling.
        if numeric > self.config.max_privilege_level:
            return PolicyDecision(
                allowed=False,
                decision="deny",
                reason=(
                    f"Command '{envelope.command_name}' has side-effect level "
                    f"{level.value} (numeric {numeric}) which exceeds the "
                    f"configured maximum privilege level "
                    f"({self.config.max_privilege_level})."
                ),
                matched_rule="privilege_ceiling",
            )

        # Rule 3: EXTERNAL_ACTION without any allowed_hosts is denied.
        if level is SideEffectLevel.EXTERNAL_ACTION and not self.config.allowed_hosts:
            return PolicyDecision(
                allowed=False,
                decision="deny",
                reason=(
                    f"Command '{envelope.command_name}' requires "
                    f"EXTERNAL_ACTION but no allowed_hosts are configured."
                ),
                matched_rule="external_no_hosts",
            )

        # Rule 4: Allow with spec-level constraints.
        constraints = spec.get("constraints", {})
        return PolicyDecision(
            allowed=True,
            decision="allow",
            reason=(
                f"Command '{envelope.command_name}' with side-effect level "
                f"{level.value} is within policy bounds."
            ),
            matched_rule="default_allow",
            constraints=constraints,
        )
