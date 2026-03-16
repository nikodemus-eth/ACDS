"""Artifact signing and verification for the M4 sovereign runtime.

Provides canonical JSON serialization and Ed25519 sign/verify operations.
All signed artifacts use deterministic serialization to ensure
signature stability across environments.
"""

from __future__ import annotations

import base64
import copy
import json
from pathlib import Path

from nacl.exceptions import BadSignatureError

from runtime.identity.key_manager import load_signing_key, load_verify_key


def canonical_json(obj: dict) -> bytes:
    """Produce deterministic JSON bytes for signing.

    Rules:
    - keys sorted alphabetically
    - no whitespace separators
    - ASCII-safe encoding
    - UTF-8 byte output
    """
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def _strip_signature(artifact: dict) -> dict:
    """Return a copy of the artifact without the signature field."""
    stripped = copy.deepcopy(artifact)
    stripped.pop("signature", None)
    return stripped


def sign_artifact(artifact: dict, role: str, keys_dir: Path) -> str:
    """Sign a JSON artifact with the specified signer role.

    Removes the 'signature' field (if present) before signing.
    Returns a base64-encoded signature string.
    """
    signing_key = load_signing_key(role, keys_dir)
    payload = canonical_json(_strip_signature(artifact))
    signed = signing_key.sign(payload)
    return base64.b64encode(signed.signature).decode("ascii")


def verify_signature(
    artifact: dict, signature_b64: str, role: str, keys_dir: Path
) -> bool:
    """Verify an artifact signature against the specified signer role.

    Returns True if the signature is valid.
    Returns False only for genuinely invalid signatures.

    Raises:
        FileNotFoundError: If the key file cannot be found (config error).
        ValueError: If the key data is corrupt or unreadable.
    """
    try:
        verify_key = load_verify_key(role, keys_dir)
    except FileNotFoundError:
        raise
    except (ValueError, Exception) as e:
        raise ValueError(f"Cannot load verify key for role '{role}': {e}")

    try:
        payload = canonical_json(_strip_signature(artifact))
        signature_bytes = base64.b64decode(signature_b64)
        verify_key.verify(payload, signature_bytes)
        return True
    except BadSignatureError:
        return False
    except Exception as e:
        raise ValueError(f"Signature verification error for role '{role}': {e}")


def sign_and_attach(artifact: dict, role: str, keys_dir: Path) -> dict:
    """Sign an artifact and attach the signature metadata.

    Returns a new dict with the 'signature' field populated.
    """
    sig_value = sign_artifact(artifact, role, keys_dir)
    result = copy.deepcopy(artifact)
    result["signature"] = {
        "algorithm": "ed25519",
        "signer_role": role,
        "signature_value": sig_value,
    }
    return result


def verify_attached_signature(artifact: dict, keys_dir: Path) -> bool:
    """Verify an artifact that has an attached signature block.

    Reads the signer_role from the signature field and verifies accordingly.
    """
    sig_block = artifact.get("signature")
    if not sig_block or not isinstance(sig_block, dict):
        return False

    role = sig_block.get("signer_role")
    sig_value = sig_block.get("signature_value")

    if not role or not sig_value:
        return False

    return verify_signature(artifact, sig_value, role, keys_dir)
