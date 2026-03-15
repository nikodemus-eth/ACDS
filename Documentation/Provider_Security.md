# Provider Security Architecture

## Credential Isolation
Provider secrets are stored using encrypted storage. The system uses envelope encryption:
- Database stores ciphertext only
- Encryption keys remain external
- Decrypt operations are logged

Secrets are never returned to applications.

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
