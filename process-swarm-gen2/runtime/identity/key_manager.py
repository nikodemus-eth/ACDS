"""Ed25519 key generation, storage, and loading for the M4 sovereign runtime.

All signing operations use Ed25519 via PyNaCl (libsodium).
Keys are stored as hex-encoded bytes with 0o600 permissions.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from nacl.signing import SigningKey, VerifyKey


def generate_keypair() -> tuple[SigningKey, VerifyKey]:
    """Generate a new Ed25519 signing keypair."""
    signing_key = SigningKey.generate()
    verify_key = signing_key.verify_key
    return signing_key, verify_key


def fingerprint(public_key_bytes: bytes) -> str:
    """Compute the fingerprint of a public key.

    Returns the first 32 hex characters of SHA-256(public_key_bytes).
    """
    digest = hashlib.sha256(public_key_bytes).hexdigest()
    return digest[:32]


def save_keypair(role: str, signing_key: SigningKey, keys_dir: Path) -> dict:
    """Save an Ed25519 keypair to disk.

    Private key: {role}.key (hex-encoded seed, permissions 0o600)
    Public key: {role}.pub (hex-encoded public key bytes)

    Returns a dict with key metadata (role, key_id, fingerprint, algorithm).
    """
    keys_dir.mkdir(parents=True, exist_ok=True)

    private_path = keys_dir / f"{role}.key"
    public_path = keys_dir / f"{role}.pub"

    # Store private key as hex-encoded 32-byte seed
    private_path.write_text(signing_key.encode().hex())
    os.chmod(private_path, 0o600)

    # Store public key as hex-encoded 32-byte key
    verify_key = signing_key.verify_key
    pub_bytes = verify_key.encode()
    public_path.write_text(pub_bytes.hex())

    fp = fingerprint(pub_bytes)
    key_id = f"{role.replace('_', '-')}-001"

    return {
        "role": role,
        "key_id": key_id,
        "algorithm": "ed25519",
        "fingerprint": fp,
        "status": "active",
        "public_key_path": str(public_path.name),
    }


def load_signing_key(role: str, keys_dir: Path) -> SigningKey:
    """Load a private signing key from disk."""
    private_path = keys_dir / f"{role}.key"
    if not private_path.exists():
        raise FileNotFoundError(f"Private key not found: {private_path}")
    seed_hex = private_path.read_text().strip()
    return SigningKey(bytes.fromhex(seed_hex))


def load_verify_key(role: str, keys_dir: Path) -> VerifyKey:
    """Load a public verification key from disk."""
    public_path = keys_dir / f"{role}.pub"
    if not public_path.exists():
        raise FileNotFoundError(f"Public key not found: {public_path}")
    pub_hex = public_path.read_text().strip()
    return VerifyKey(bytes.fromhex(pub_hex))


def load_verify_key_from_registry(
    role: str, key_registry: dict, keys_dir: Path
) -> VerifyKey:
    """Load a verification key by looking up the role in the key registry."""
    for entry in key_registry.get("active_keys", []):
        if entry["role"] == role and entry["status"] == "active":
            return load_verify_key(role, keys_dir)
    raise ValueError(f"No active key found for role: {role}")


# Standard signer roles
SIGNER_ROLES = [
    "validator_signer",
    "compiler_signer",
    "approval_signer",
    "node_attestation_signer",
    "lease_issuer_signer",
]
