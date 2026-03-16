"""AdapterRegistry: discovery and dispatch for tool adapters."""

from __future__ import annotations

from swarm.tools.base import ToolAdapter


class AdapterRegistry:
    """Maps tool names to adapter instances."""

    def __init__(self):
        self._adapters: dict[str, ToolAdapter] = {}

    def register(self, adapter: ToolAdapter) -> None:
        """Register an adapter. Raises ValueError if name already taken."""
        name = adapter.tool_name
        if name in self._adapters:
            raise ValueError(f"Adapter '{name}' already registered")
        self._adapters[name] = adapter

    def get_adapter(self, tool_name: str) -> ToolAdapter | None:
        """Look up adapter by tool name. Returns None if not found."""
        return self._adapters.get(tool_name)

    def has_adapter(self, tool_name: str) -> bool:
        """Check if an adapter is registered for this tool name."""
        return tool_name in self._adapters

    def list_adapters(self) -> list[str]:
        """Return sorted list of registered adapter names."""
        return sorted(self._adapters.keys())

    @classmethod
    def create_default(cls) -> AdapterRegistry:
        """Create registry with all built-in adapters."""
        from swarm.tools.adapters import ALL_ADAPTERS

        reg = cls()
        for adapter_cls in ALL_ADAPTERS:
            reg.register(adapter_cls())
        return reg
