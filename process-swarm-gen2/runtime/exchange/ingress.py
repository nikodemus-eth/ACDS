"""Inter-node exchange ingress handler for the M4 sovereign runtime.

Handles artifact intake from M2 through quarantine -> validate -> accept/reject.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from runtime.schemas.schema_validator import validate_artifact

ALLOWED_FROM_M2 = {
    "behavior_proposal", "research_brief", "analysis_note",
    "source_map", "post_pack", "publication_summary", "link_bundle",
}

FORBIDDEN_FROM_M2 = {
    "execution_plan", "capability_lease", "execution_record",
    "node_identity", "key_registry",
}


class IngressHandler:
    """Handles artifact intake from M2 through quarantine."""

    def __init__(self, ingress_dir: Path, schemas_dir: Optional[Path] = None):
        self.quarantine_dir = ingress_dir / "quarantine"
        self.validated_dir = ingress_dir / "validated"
        self.rejected_dir = ingress_dir / "rejected"
        self.schemas_dir = schemas_dir

        self.quarantine_dir.mkdir(parents=True, exist_ok=True)
        self.validated_dir.mkdir(parents=True, exist_ok=True)
        self.rejected_dir.mkdir(parents=True, exist_ok=True)

    def scan_exports(self, m2_exports_dir: Path) -> list:
        if not m2_exports_dir.exists():
            return []
        return sorted(m2_exports_dir.glob("*.json"))

    def quarantine(self, artifact_path: Path) -> Path:
        dest = self.quarantine_dir / artifact_path.name
        shutil.copy2(artifact_path, dest)
        return dest

    def process_quarantine(self) -> list:
        results = []
        for f in sorted(self.quarantine_dir.glob("*.json")):
            results.append(self._process_artifact(f))
        return results

    def _process_artifact(self, path: Path) -> dict:
        try:
            with open(path) as f:
                artifact = json.load(f)
        except (json.JSONDecodeError, Exception) as e:
            return self._reject(path, f"Failed to parse JSON: {e}")

        # SECURITY: Check forbidden content markers
        forbidden_markers = {
            "execution_plan": ["plan_id", "steps", "required_capabilities"],
            "capability_lease": ["lease_id", "granted_capabilities"],
            "execution_record": ["record_id", "execution_status", "actions"],
            "node_identity": ["node_id", "node_role", "attestation_key_fingerprint"],
            "key_registry": ["registry_version", "active_keys"],
        }
        for forbidden_type, markers in forbidden_markers.items():
            if all(m in artifact for m in markers):
                return self._reject(
                    path, f"Artifact contains markers for forbidden type '{forbidden_type}'"
                )

        artifact_type = self._infer_type(path, artifact)

        if artifact_type in FORBIDDEN_FROM_M2:
            return self._reject(path, f"Artifact type '{artifact_type}' is forbidden from M2")

        if artifact_type in ("behavior_proposal",):
            result = validate_artifact(artifact, artifact_type, self.schemas_dir)
            if not result.valid:
                return self._reject(path, f"Schema validation failed: {'; '.join(result.errors)}")

        return self._accept(path, artifact_type)

    def _infer_type(self, path: Path, artifact: dict) -> str:
        name = path.stem.lower()
        if "proposal_id" in artifact:
            return "behavior_proposal"
        for artifact_type in ALLOWED_FROM_M2 | FORBIDDEN_FROM_M2:
            if artifact_type.replace("_", "-") in name or artifact_type in name:
                return artifact_type
        return "unknown"

    def _accept(self, path: Path, artifact_type: str) -> dict:
        dest = self.validated_dir / path.name
        shutil.move(str(path), str(dest))
        return {
            "artifact_path": str(dest),
            "artifact_type": artifact_type,
            "status": "accepted",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }

    def _reject(self, path: Path, reason: str) -> dict:
        dest = self.rejected_dir / path.name
        shutil.move(str(path), str(dest))
        return {
            "artifact_path": str(dest),
            "artifact_type": "unknown",
            "status": "rejected",
            "reason": reason,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }
