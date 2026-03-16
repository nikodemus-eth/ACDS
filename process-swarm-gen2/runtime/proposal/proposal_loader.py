"""Behavior proposal loading and storage."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from runtime.schemas.schema_validator import validate_artifact_strict


def load_proposal(path: Path, schemas_dir: Optional[Path] = None) -> dict:
    """Load a behavior proposal from a JSON file.

    Validates against the behavior_proposal schema.
    """
    if not path.exists():
        raise FileNotFoundError(f"Proposal not found: {path}")
    with open(path, "r") as f:
        proposal = json.load(f)
    validate_artifact_strict(proposal, "behavior_proposal", schemas_dir)
    return proposal


def store_proposal(proposal: dict, proposals_dir: Path) -> Path:
    """Store a proposal in the artifacts/proposals directory."""
    proposals_dir.mkdir(parents=True, exist_ok=True)
    proposal_id = proposal.get("proposal_id", "unknown")
    dest = proposals_dir / f"{proposal_id}.json"
    with open(dest, "w") as f:
        json.dump(proposal, f, indent=2)
    return dest
