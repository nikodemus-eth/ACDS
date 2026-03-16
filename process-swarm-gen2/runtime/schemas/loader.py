"""Schema loading for the M4 sovereign runtime.

Loads JSON Schema files from the schemas/ directory and provides
a registry for looking up schemas by artifact class name.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

# Default schemas directory relative to project root
_DEFAULT_SCHEMAS_DIR = Path(__file__).parent.parent.parent / "schemas"


def load_schema(schema_name: str, schemas_dir: Optional[Path] = None) -> dict:
    """Load a JSON Schema by artifact class name.

    Args:
        schema_name: The artifact class name (e.g., 'behavior_proposal').
                     Automatically appends '.schema.json' if needed.
        schemas_dir: Directory containing schema files.

    Returns:
        The parsed JSON Schema dict.

    Raises:
        FileNotFoundError: If the schema file does not exist.
        json.JSONDecodeError: If the schema file contains invalid JSON.
    """
    if schemas_dir is None:
        schemas_dir = _DEFAULT_SCHEMAS_DIR

    if not schema_name.endswith(".schema.json"):
        filename = f"{schema_name}.schema.json"
    else:
        filename = schema_name

    schema_path = schemas_dir / filename
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema not found: {schema_path}")

    with open(schema_path, "r") as f:
        return json.load(f)


def get_all_schemas(schemas_dir: Optional[Path] = None) -> dict:
    """Load all schemas from the schemas directory.

    Returns a dict mapping schema name (without extension) to schema dict.
    """
    if schemas_dir is None:
        schemas_dir = _DEFAULT_SCHEMAS_DIR

    schemas = {}
    for schema_path in sorted(schemas_dir.glob("*.schema.json")):
        name = schema_path.name.replace(".schema.json", "")
        with open(schema_path, "r") as f:
            schemas[name] = json.load(f)

    return schemas


def list_schema_names(schemas_dir: Optional[Path] = None) -> list:
    """List all available schema names."""
    if schemas_dir is None:
        schemas_dir = _DEFAULT_SCHEMAS_DIR

    return sorted(
        p.name.replace(".schema.json", "")
        for p in schemas_dir.glob("*.schema.json")
    )
