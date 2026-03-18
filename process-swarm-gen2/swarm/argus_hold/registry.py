"""CommandRegistry: loads and provides access to versioned command specifications."""

from __future__ import annotations

import json
from pathlib import Path

_REQUIRED_FIELDS = {"command_name", "version", "parameters_schema"}


class CommandRegistry:
    """Loads and provides access to versioned command specifications.

    On init, every ``*.json`` file in the given specs directory is loaded and
    validated.  Specs are keyed by their ``command_name`` field so look-ups are
    O(1).
    """

    def __init__(self, specs_dir: str | Path | None = None) -> None:
        if specs_dir is None:
            specs_dir = Path(__file__).parent / "command_specs"
        else:
            specs_dir = Path(specs_dir)

        self._specs: dict[str, dict] = {}
        self._load_specs(specs_dir)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_spec(self, command_name: str) -> dict | None:
        """Return the spec dict for *command_name*, or ``None`` if not found."""
        return self._specs.get(command_name)

    def has_command(self, command_name: str) -> bool:
        """Check whether a command is registered."""
        return command_name in self._specs

    def list_commands(self) -> list[str]:
        """Return a sorted list of all registered command names."""
        return sorted(self._specs.keys())

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _load_specs(self, specs_dir: Path) -> None:
        """Discover and validate every JSON spec in *specs_dir*."""
        if not specs_dir.is_dir():
            return

        for spec_path in sorted(specs_dir.glob("*.json")):
            with open(spec_path, encoding="utf-8") as fh:
                spec = json.load(fh)

            missing = _REQUIRED_FIELDS - spec.keys()
            if missing:
                raise ValueError(
                    f"{spec_path.name}: missing required fields {missing}"
                )

            name = spec["command_name"]
            if name in self._specs:
                raise ValueError(
                    f"{spec_path.name}: duplicate command_name '{name}'"
                )

            self._specs[name] = spec
