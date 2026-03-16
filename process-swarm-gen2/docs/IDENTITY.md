# Identity and Signing System

The M4 sovereign runtime uses Ed25519 cryptographic signatures to ensure the
integrity and provenance of every artifact that flows through the system. All
signing operations are backed by PyNaCl (libsodium).

Source files:

- `runtime/identity/key_manager.py` -- key generation, storage, loading,
  fingerprinting, and role definitions
- `runtime/identity/signer.py` -- canonical JSON serialization, sign/verify
  operations, and attached-signature helpers

---

## Key Generation

Key pairs are generated with `generate_keypair()`, which delegates to
`nacl.signing.SigningKey.generate()`. Each call produces:

- A 32-byte Ed25519 **signing key** (private)
- A 32-byte Ed25519 **verify key** (public), derived from the signing key

## Key Storage

`save_keypair(role, signing_key, keys_dir)` persists a key pair to disk as two
files under the given directory:

| File | Contents | Permissions |
|------|----------|-------------|
| `{role}.key` | Hex-encoded 32-byte seed (private key) | `0o600` (owner read/write only) |
| `{role}.pub` | Hex-encoded 32-byte public key | Default |

The function returns a metadata dict containing `role`, `key_id`, `algorithm`,
`fingerprint`, and `status`. The `key_id` is derived from the role name with
underscores replaced by hyphens and a `-001` suffix (e.g.,
`validator-signer-001`).

### Fingerprinting

`fingerprint(public_key_bytes)` computes the first 32 hex characters of the
SHA-256 hash of the raw public-key bytes. This short identifier is used in key
registries and audit logs to reference a key without exposing its full value.

### Loading Keys

Two loading functions retrieve keys from disk:

- `load_signing_key(role, keys_dir)` -- reads `{role}.key`, decodes the hex
  seed, and returns a `SigningKey`.
- `load_verify_key(role, keys_dir)` -- reads `{role}.pub`, decodes the hex
  bytes, and returns a `VerifyKey`.

A third function, `load_verify_key_from_registry(role, key_registry, keys_dir)`,
looks up the role in a key registry dict (checking for `status == "active"`)
before delegating to `load_verify_key`. This ensures that only keys the registry
considers active can be used for verification.

---

## Signer Roles

The system defines five signer roles in the `SIGNER_ROLES` list. Each role
represents a distinct trust boundary:

| Role | Purpose |
|------|---------|
| `validator_signer` | Signs validation verdicts -- the output of schema and rule checks that confirm an artifact conforms to policy. |
| `compiler_signer` | Signs compiled artifacts -- the output of the compilation pipeline that transforms process definitions into executable form. |
| `approval_signer` | Signs human or automated approval decisions -- the governance layer's go/no-go verdicts before an artifact enters production. |
| `node_attestation_signer` | Signs node attestation records -- cryptographic proof that a specific runtime node produced a specific result. |
| `lease_issuer_signer` | Signs capability leases -- the time-bounded grants that authorize a ToolGate to enable specific capabilities. |

Separating roles means a compromise of one key does not affect the trust of
artifacts signed by other roles. Each role has its own key pair and can be
rotated independently.

---

## Canonical JSON Serialization

Before any artifact is signed, it is serialized to a deterministic byte
representation using `canonical_json(obj)`. The rules are:

1. Keys are sorted alphabetically (`sort_keys=True`).
2. No whitespace between separators (`separators=(",", ":")`).
3. ASCII-safe encoding (`ensure_ascii=True`).
4. Output is UTF-8 bytes.

This guarantees that the same logical dict always produces the same byte
sequence, regardless of Python dict insertion order or platform differences.
Signature stability depends on this property.

---

## Signature Format

### Signing

`sign_artifact(artifact, role, keys_dir)` performs these steps:

1. Deep-copies the artifact and strips any existing `signature` field.
2. Serializes the stripped artifact to canonical JSON bytes.
3. Signs the bytes with the Ed25519 signing key for the specified role.
4. Returns the raw 64-byte signature as a **base64-encoded ASCII string**.

### Attached Signatures

`sign_and_attach(artifact, role, keys_dir)` calls `sign_artifact` and then
attaches the signature as a nested dict:

```json
{
  "signature": {
    "algorithm": "ed25519",
    "signer_role": "validator_signer",
    "signature_value": "<base64-encoded signature>"
  }
}
```

The returned dict is a deep copy -- the original artifact is never mutated.

---

## Verification Chain

### Single Verification

`verify_signature(artifact, signature_b64, role, keys_dir)` reverses the
signing process:

1. Loads the public verify key for the given role.
2. Strips the `signature` field and re-serializes to canonical JSON.
3. Base64-decodes the signature string.
4. Calls `verify_key.verify(payload, signature_bytes)`.

Returns `True` on success, `False` for an invalid signature. Raises
`FileNotFoundError` if the key file is missing (a configuration error, not a
verification failure) and `ValueError` if the key data is corrupt.

### Attached Verification

`verify_attached_signature(artifact, keys_dir)` reads the `signer_role` and
`signature_value` from the artifact's own `signature` block, then delegates to
`verify_signature`. Returns `False` if the signature block is missing or
incomplete.

This self-describing format means a verifier does not need to know in advance
which role signed an artifact -- the artifact carries that metadata.

---

## Key Rotation Considerations

The current design supports key rotation through these mechanisms:

- **Key ID versioning**: The `-001` suffix on key IDs provides a natural
  extension point. A rotated key could use `-002`, `-003`, etc.
- **Registry-based lookup**: `load_verify_key_from_registry` checks for
  `status == "active"`, which means marking an old key as `"revoked"` or
  `"retired"` in the registry will immediately prevent its use for
  verification.
- **Role isolation**: Because each role has independent key material, a single
  role's key can be rotated without touching the others.

To perform a rotation:

1. Generate a new key pair with `generate_keypair()`.
2. Save it with `save_keypair()` (updating the key ID suffix).
3. Update the key registry: set the old entry's status to `"retired"` and add
   the new entry as `"active"`.
4. Re-sign any artifacts that need to remain verifiable under the new key.

Artifacts signed with a retired key will fail verification through the
registry-based path, which is the intended behavior -- it forces re-signing
with current key material.
