"""Lineage tracking for ACDS integration execution.

Records every node execution with inputs, outputs, provider selection,
and decision traces to enable full process auditing.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from swarm.integration.contracts import _now_utc, _short_id


@dataclass
class LineageEntry:
    """Single execution record in the integration lineage."""

    entry_id: str = field(default_factory=_short_id)
    process_id: str = ""
    node_id: str = ""
    node_type: str = ""
    capability: str | None = None
    provider_id: str | None = None
    request_id: str | None = None
    input_hash: str = ""
    output_hash: str = ""
    decision_trace: dict | None = None
    artifacts: list[str] = field(default_factory=list)
    timestamp: str = field(default_factory=_now_utc)
    duration_ms: int = 0
    parent_entry_id: str | None = None  # Previous node in the chain


def _hash_dict(d: dict) -> str:
    """Produce a stable SHA-256 hex digest of a dict."""
    raw = json.dumps(d, sort_keys=True, default=str).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


class LineageTracker:
    """Collects and persists lineage entries for a swarm run.

    Entries are held in memory and flushed to a JSON file on ``save()``.
    """

    def __init__(self, workspace: Path):
        self._entries: list[LineageEntry] = []
        self._path = workspace / "integration_lineage.json"

    def record(self, entry: LineageEntry) -> None:
        """Append an entry to the in-memory ledger."""
        self._entries.append(entry)

    def get_chain(self, process_id: str) -> list[LineageEntry]:
        """Return all entries for a given process, in insertion order."""
        return [e for e in self._entries if e.process_id == process_id]

    def save(self) -> None:
        """Write the full ledger to ``integration_lineage.json``."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        data = [asdict(e) for e in self._entries]
        self._path.write_text(json.dumps(data, indent=2, default=str))

    @staticmethod
    def hash_data(d: dict) -> str:
        """Public helper to hash a dict for lineage recording."""
        return _hash_dict(d)
