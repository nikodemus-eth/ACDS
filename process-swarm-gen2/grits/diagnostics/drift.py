from __future__ import annotations

"""Drift diagnostic suite: 3 configuration drift checks."""

from pathlib import Path


def test_adapter_count_drift(context: dict) -> tuple[str, dict, dict]:
    """Compare current adapter count against baseline."""
    try:
        from swarm.tools.registry import AdapterRegistry

        registry = AdapterRegistry.create_default()
        count = len(registry.list_adapters())

        # Just report the count; baseline comparison handles drift detection
        return "passed", {"count": count}, {
            "adapter_names": registry.list_adapters(),
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}


def test_schema_count_drift(context: dict) -> tuple[str, dict, dict]:
    """Compare current schema count against baseline."""
    root = Path(context["openclaw_root"])
    schemas_dir = root / "schemas"

    if not schemas_dir.is_dir():
        return "failed", {"count": 0}, {"reason": f"{schemas_dir} not found"}

    schema_files = list(schemas_dir.glob("*.schema.json"))
    count = len(schema_files)

    return "passed", {"count": count}, {
        "schema_names": [f.stem.replace(".schema", "") for f in schema_files],
    }


def test_key_fingerprint_drift(context: dict) -> tuple[str, dict, dict]:
    """Compare key fingerprints against baseline."""
    root = Path(context["openclaw_root"])
    keys_dir = root / "runtime" / "identity" / "keys"

    if not keys_dir.is_dir():
        return "failed", {}, {"reason": f"{keys_dir} not found"}

    try:
        import hashlib

        fingerprints: dict[str, str] = {}
        for pub_file in sorted(keys_dir.glob("*.pub")):
            content = pub_file.read_text().strip()
            fp = hashlib.sha256(content.encode()).hexdigest()[:32]
            fingerprints[pub_file.stem] = fp

        if not fingerprints:
            return "failed", {}, {"reason": "No public key files found"}

        return "passed", {"key_count": len(fingerprints)}, {
            "fingerprints": fingerprints,
        }
    except Exception as exc:
        return "error", {}, {"error": str(exc)}
