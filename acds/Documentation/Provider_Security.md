# Provider Security Architecture

## Credential Isolation
Provider secrets are stored using encrypted storage. The system uses envelope encryption:
- Database stores ciphertext only (AES-256-GCM, 12-byte IV per NIST SP 800-38D)
- Encryption keys remain external, resolved via abstract `KeyResolver` interface
- Decrypt operations are logged
- Secret rotation via `SecretRotationService`: re-encrypts with current key, updates cipher store atomically

Secrets are never returned to applications.

## Error Redaction
All error messages are scrubbed before logging or returning to clients:
- API keys in URL parameters (`key=[REDACTED]`)
- Bearer tokens in Authorization headers
- URL-embedded credentials (`user:pass@host`)
- JSON key-value pairs containing sensitive field names
- Nested object properties matching sensitive key patterns (recursive)

Provider adapter errors never include credentials in their messages. The Gemini adapter separates base endpoint URLs from key-appended request URLs to prevent key leakage in `AdapterError` construction.

## Broker Execution Modes

### Proxy Mode (Default)
The broker executes the provider call directly. Applications only see normalized responses.

### Lease Mode
For specific cases, the broker can mint short-lived execution leases:
- lease_id
- provider_id
- capability_scope
- expires_at
- usage_limits

This allows temporary direct execution while preserving security.
