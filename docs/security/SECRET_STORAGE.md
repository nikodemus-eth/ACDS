# Secret Storage

ACDS uses envelope encryption to protect provider API keys and other sensitive credentials. Plaintext secrets are never stored at rest and never appear in logs, API responses, or audit events.

## Envelope Encryption

All secrets are encrypted using **AES-256-GCM** (authenticated encryption with associated data). The system uses envelope encryption, meaning:

1. A **master key** (256-bit / 32-byte) is used to encrypt and decrypt secrets.
2. Each encrypted secret is stored as an `EncryptedEnvelope`:

```typescript
{
  ciphertext: string;   // Base64-encoded encrypted data
  iv: string;           // Base64-encoded initialization vector (16 bytes)
  authTag: string;      // Base64-encoded authentication tag (16 bytes)
  keyId: string;        // Identifies which master key was used
  algorithm: string;    // Always "aes-256-gcm"
}
```

The IV is randomly generated for every encryption operation, ensuring that encrypting the same plaintext twice produces different ciphertext. The authentication tag provides tamper detection -- any modification to the ciphertext, IV, or associated data will cause decryption to fail.

## Key Resolution

The master key is resolved at runtime through a `KeyResolver` interface. Two implementations are provided:

### FileKeyResolver

Reads the master key from a file on disk:

```
MASTER_KEY_PATH=/path/to/master.key
```

The file should contain exactly 32 bytes of key material. This is the recommended approach for production deployments where the key file is provisioned via a secrets manager or mounted from an encrypted volume.

### EnvironmentKeyResolver

Reads the master key from an environment variable:

```
MASTER_KEY=<64-character hex string>
```

The hex string is decoded into 32 bytes. This approach is suitable for containerized deployments where secrets are injected via environment variables.

Both resolvers support key identification via `keyId`, which allows the system to determine which key was used to encrypt a given envelope. This is the foundation for key rotation.

## Key Rotation

Key rotation is managed by `SecretRotationService`. The rotation process:

1. A new master key is generated and made available to the key resolver under a new `keyId`.
2. The rotation service re-encrypts all stored secrets using the new key.
3. Each re-encrypted envelope gets the new `keyId`.
4. The old key is retained (read-only) until all envelopes have been rotated.

The recommended rotation interval is configured via `SECRET_ROTATION_INTERVAL_DAYS` (default: 90 days).

During rotation, the system can decrypt envelopes encrypted with either the old or new key by looking up the `keyId` on each envelope.

## Plaintext Protection

The system enforces several layers of protection to ensure plaintext secrets never leak:

### At Rest
- Secrets are stored only as `EncryptedEnvelope` objects. The `SecretCipherStore` interface does not support storing unencrypted values.

### In Transit
- API responses use presenters that exclude secret fields entirely.
- The `SecretRedactor` replaces secret values with a redaction marker before any serialization.

### In Logs
- `redactObject` recursively scans objects for fields matching known secret patterns (keys containing "secret", "key", "token", "password", "credential") and replaces their values with `[REDACTED]`.
- `redactError` sanitizes error messages and stack traces that might contain secret values.
- `redactHeaders` removes authorization headers and other sensitive header values from logged HTTP requests.

### In Audit Events
- Audit event builders never include raw secret material. Provider events reference providers by ID, not by credential.

## Persistence

Encrypted secrets are stored in the `provider_secrets` table:

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `provider_id` | VARCHAR (UNIQUE) | The provider this secret belongs to |
| `envelope` | JSONB | The `EncryptedEnvelope` object |
| `created_at` | TIMESTAMPTZ | When the secret was first stored |
| `rotated_at` | TIMESTAMPTZ | When the secret was last rotated (null if never) |
| `expires_at` | TIMESTAMPTZ | Optional expiry timestamp |

The `PgSecretCipherStore` implements the `SecretCipherStore` interface and provides:
- **Upsert semantics** on `store()` -- inserting a secret for a provider that already has one replaces the envelope.
- **Rotation tracking** -- `rotate()` updates the envelope and sets `rotated_at`.
- **Idempotent revocation** -- `revoke()` deletes the row; calling it twice is safe.

Migration: `infra/db/migrations/008_secret_store_and_rollback_snapshots.sql`
