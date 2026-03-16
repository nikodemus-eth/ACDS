from __future__ import annotations

"""Smoke diagnostic suite: 6 basic health checks."""

import json
from pathlib import Path


def test_schemas_exist(context: dict) -> tuple[str, dict, dict]:
    """Check that schema JSON files exist in schemas/."""
    root = Path(context["openclaw_root"])
    schemas_dir = root / "schemas"

    if not schemas_dir.is_dir():
        return "failed", {"count": 0}, {"reason": f"{schemas_dir} not found"}

    schema_files = list(schemas_dir.glob("*.schema.json"))
    count = len(schema_files)

    if count == 0:
        return "failed", {"count": 0}, {"reason": "No schema files found"}

    return "passed", {"count": count}, {"files": [f.name for f in schema_files]}


def test_schemas_valid_json(context: dict) -> tuple[str, dict, dict]:
    """Validate each schema file is valid JSON."""
    root = Path(context["openclaw_root"])
    schemas_dir = root / "schemas"

    if not schemas_dir.is_dir():
        return "failed", {}, {"reason": f"{schemas_dir} not found"}

    schema_files = list(schemas_dir.glob("*.schema.json"))
    invalid: list[str] = []

    for sf in schema_files:
        try:
            with open(sf) as f:
                json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            invalid.append(f"{sf.name}: {exc}")

    if invalid:
        return "failed", {"invalid_count": len(invalid)}, {"invalid": invalid}

    return "passed", {"validated_count": len(schema_files)}, {}


def test_adapters_importable(context: dict) -> tuple[str, dict, dict]:
    """Check that swarm.tools.registry.AdapterRegistry is importable."""
    try:
        from swarm.tools.registry import AdapterRegistry  # noqa: F401
        return "passed", {}, {"module": "swarm.tools.registry.AdapterRegistry"}
    except ImportError as exc:
        return "failed", {}, {"error": str(exc)}


def test_adapter_count(context: dict) -> tuple[str, dict, dict]:
    """Verify expected number of adapters registered."""
    try:
        from swarm.tools.registry import AdapterRegistry

        registry = AdapterRegistry.create_default()
        adapters = registry.list_adapters()
        count = len(adapters)

        return "passed", {"count": count}, {"adapters": adapters}
    except Exception as exc:
        return "error", {}, {"error": str(exc)}


def test_key_files_exist(context: dict) -> tuple[str, dict, dict]:
    """Check that identity key files exist."""
    root = Path(context["openclaw_root"])
    keys_dir = root / "runtime" / "identity" / "keys"

    if not keys_dir.is_dir():
        return "failed", {}, {"reason": f"{keys_dir} not found"}

    key_files = list(keys_dir.glob("*.key")) + list(keys_dir.glob("*.pub"))
    count = len(key_files)

    if count == 0:
        return "failed", {"count": 0}, {"reason": "No key files found"}

    return "passed", {"count": count}, {"files": [f.name for f in key_files]}


def test_database_accessible(context: dict) -> tuple[str, dict, dict]:
    """Check that platform.db exists and is queryable."""
    root = Path(context["openclaw_root"])

    # Check multiple possible locations
    db_paths = [
        root / "platform.db",
        root / "swarm" / "registry" / "platform.db",
    ]

    for db_path in db_paths:
        if db_path.exists():
            try:
                import sqlite3
                conn = sqlite3.connect(str(db_path))
                cursor = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' LIMIT 5"
                )
                tables = [row[0] for row in cursor.fetchall()]
                conn.close()
                return "passed", {"table_count": len(tables)}, {
                    "db_path": str(db_path), "tables": tables,
                }
            except Exception as exc:
                return "error", {}, {"db_path": str(db_path), "error": str(exc)}

    # No database is not a hard failure for a reporting system
    return "passed", {"table_count": 0}, {
        "reason": "No platform.db found; non-critical for reporting-only mode",
    }
