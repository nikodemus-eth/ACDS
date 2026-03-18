"""Stage 5 -- ExecutionPlanner: build concrete execution plans from authorised envelopes.

The planner is the final pipeline stage before adapter dispatch.  It
collects the outputs of the preceding stages (policy decision, scope
check) together with the original envelope and the command spec into an
:class:`ExecutionPlan` that an adapter can execute without further
look-ups.
"""

from __future__ import annotations

from swarm.argus_hold.models import (
    CommandEnvelope,
    ExecutionPlan,
    PolicyDecision,
    ScopeCheck,
    new_id,
)


class ExecutionPlanner:
    """Builds concrete execution plans from authorised command envelopes."""

    def build(
        self,
        envelope: CommandEnvelope,
        policy: PolicyDecision,
        scope: ScopeCheck,
        spec: dict,
    ) -> ExecutionPlan:
        """Build an :class:`ExecutionPlan`.

        Parameters
        ----------
        envelope:
            The normalised and validated command envelope.
        policy:
            The policy decision that authorised this envelope.
        scope:
            The scope check confirming all paths/hosts are in bounds.
        spec:
            The command specification dict (used for timeout and
            expected artifact hints).

        Returns
        -------
        ExecutionPlan
            A fully resolved plan ready for adapter dispatch.
        """
        # Derive adapter name from the command namespace.
        # "filesystem.read_file" --> "filesystem"
        adapter_name = envelope.command_name.split(".")[0]

        # Timeout: spec value (seconds) converted to milliseconds,
        # falling back to a 30-second default.
        timeout_ms = spec.get("timeout_seconds", 30) * 1000

        return ExecutionPlan(
            plan_id=new_id("plan"),
            envelope=envelope,
            policy_decision=policy,
            scope_check=scope,
            adapter_name=adapter_name,
            timeout_ms=timeout_ms,
            expected_artifacts=[f"{envelope.command_name}.result"],
        )
