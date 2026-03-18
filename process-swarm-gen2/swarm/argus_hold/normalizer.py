"""Stage 1 -- Normalizer: convert upstream action dicts into canonical CommandEnvelopes.

The normalizer sits at the boundary between the swarm runner (which
speaks generic *action dicts*) and the ARGUS-Hold pipeline (which speaks
typed :class:`CommandEnvelope` objects).  If the action's ``tool_name``
is not registered in the :class:`CommandRegistry`, the normalizer
returns ``None`` to signal that the action should be passed through to
non-ARGUS-Hold handling.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from swarm.argus_hold.models import (
    CommandEnvelope,
    SideEffectLevel,
    new_id,
    now_utc,
)

if TYPE_CHECKING:
    from swarm.argus_hold.registry import CommandRegistry


class Normalizer:
    """Converts upstream action dicts into canonical CommandEnvelopes."""

    def __init__(self, registry: CommandRegistry) -> None:
        self.registry = registry

    def normalize(
        self,
        action: dict,
        run_id: str,
        swarm_id: str,
    ) -> CommandEnvelope | None:
        """Normalize an action dict into a :class:`CommandEnvelope`.

        Parameters
        ----------
        action:
            Raw action dict produced by the swarm runner.  Expected keys:

            * ``tool_name`` -- dotted command name (e.g. ``"filesystem.read_file"``)
            * ``config``    -- parameter dict forwarded as envelope parameters
            * ``dry_run``   -- optional bool, defaults to ``False``
            * ``metadata``  -- optional dict of caller-supplied metadata

        run_id:
            Identifier of the current pipeline run.
        swarm_id:
            Identifier of the swarm that owns the run.

        Returns
        -------
        CommandEnvelope | None
            A fully populated envelope, or ``None`` if *tool_name* is not
            registered as an ARGUS-Hold command (passthrough signal).
        """
        tool_name = action.get("tool_name", "")
        spec = self.registry.get_spec(tool_name)
        if spec is None:
            return None  # Not an ARGUS-Hold command -- pass through

        # Map the spec's side_effect_level string to the enum member.
        level = SideEffectLevel(spec["side_effect_level"])

        return CommandEnvelope(
            envelope_id=new_id("env"),
            command_name=tool_name,
            version=spec.get("version", "1.0"),
            parameters=action.get("config", {}),
            side_effect_level=level,
            run_id=run_id,
            swarm_id=swarm_id,
            created_at=now_utc(),
            dry_run=action.get("dry_run", False),
            metadata=action.get("metadata", {}),
            source_action=action,
        )
