import hashlib
import json
from pathlib import Path
from swarm.openshell.models import CommandEnvelope, StageResult, LedgerEntry, new_id, now_utc
from swarm.openshell.config import OpenShellConfig
from swarm.openshell.errors import LedgerIntegrityError

GENESIS_HASH = "0" * 64

class LedgerWriter:
    """Append-only, hash-chained ledger for OpenShell command execution."""

    def __init__(self, config: OpenShellConfig):
        self.config = config
        self._ledger_path = Path(config.ledger_root) / "openshell_ledger.jsonl"
        self._prev_hash = GENESIS_HASH
        self._sequence = 0
        self._recover_state()

    def _recover_state(self) -> None:
        """Recover prev_hash and sequence from existing ledger file."""
        if not self._ledger_path.exists():
            return
        last_line = ""
        with open(self._ledger_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    last_line = line
        if last_line:
            entry = json.loads(last_line)
            self._prev_hash = entry.get("chain_hash", GENESIS_HASH)
            self._sequence = entry.get("sequence_number", 0) + 1

    def append(self, envelope: CommandEnvelope, stage_results: list[StageResult],
               outcome: str) -> LedgerEntry:
        """Create and append a ledger entry."""
        stage_summary = {sr.stage_name: sr.verdict.value for sr in stage_results}

        entry_data = {
            "entry_id": new_id("led"),
            "sequence_number": self._sequence,
            "timestamp": now_utc(),
            "run_id": envelope.run_id,
            "envelope_id": envelope.envelope_id,
            "command_name": envelope.command_name,
            "stage_summary": stage_summary,
            "outcome": outcome,
        }

        content_hash = self._compute_content_hash(entry_data)
        chain_hash = self._compute_chain_hash(self._prev_hash, content_hash)

        entry = LedgerEntry(
            **entry_data,
            content_hash=content_hash,
            prev_hash=self._prev_hash,
            chain_hash=chain_hash,
        )

        # Write to disk
        self._ledger_path.parent.mkdir(parents=True, exist_ok=True)
        full_record = {**entry_data, "content_hash": content_hash, "prev_hash": self._prev_hash, "chain_hash": chain_hash}
        with open(self._ledger_path, "a") as f:
            f.write(json.dumps(full_record, separators=(",", ":")) + "\n")

        # Update state
        self._prev_hash = chain_hash
        self._sequence += 1

        return entry

    @staticmethod
    def _compute_content_hash(entry_data: dict) -> str:
        canonical = json.dumps(entry_data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()

    @staticmethod
    def _compute_chain_hash(prev_hash: str, content_hash: str) -> str:
        combined = f"{prev_hash}{content_hash}"
        return hashlib.sha256(combined.encode()).hexdigest()

    @classmethod
    def verify_chain(cls, ledger_path: Path) -> list[str]:
        """Verify hash chain integrity. Returns list of violations (empty = valid)."""
        violations = []
        if not ledger_path.exists():
            return violations

        prev_hash = GENESIS_HASH
        with open(ledger_path) as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)

                # Verify content hash
                entry_data = {k: v for k, v in entry.items() if k not in ("content_hash", "prev_hash", "chain_hash")}
                expected_content = cls._compute_content_hash(entry_data)
                if entry.get("content_hash") != expected_content:
                    violations.append(f"Line {line_num}: content_hash mismatch")

                # Verify prev_hash
                if entry.get("prev_hash") != prev_hash:
                    violations.append(f"Line {line_num}: prev_hash mismatch (expected {prev_hash[:16]}...)")

                # Verify chain hash
                expected_chain = cls._compute_chain_hash(prev_hash, entry.get("content_hash", ""))
                if entry.get("chain_hash") != expected_chain:
                    violations.append(f"Line {line_num}: chain_hash mismatch")

                prev_hash = entry.get("chain_hash", "")

        return violations
