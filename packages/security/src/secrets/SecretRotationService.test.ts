import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretRotationService } from './SecretRotationService.js';
import type { SecretCipherStore, StoredSecret } from './SecretCipherStore.js';
import type { EncryptedEnvelope } from '../crypto/cipherTypes.js';
import type { KeyResolver, KeyMaterial } from '../crypto/keyResolver.js';

function makeInMemoryKeyResolver(keyBuffer: Buffer, keyId = 'test-key-1'): KeyResolver {
  return {
    async resolveCurrentKey(): Promise<KeyMaterial> {
      return { keyId, keyBuffer };
    },
    async resolveKeyById(id: string): Promise<KeyMaterial> {
      if (id !== keyId) throw new Error(`Unknown key ID: ${id}`);
      return { keyId, keyBuffer };
    },
  };
}

class InMemorySecretStore implements SecretCipherStore {
  private secrets = new Map<string, StoredSecret>();

  async store(providerId: string, envelope: EncryptedEnvelope): Promise<StoredSecret> {
    const stored: StoredSecret = {
      id: `secret-${providerId}`,
      providerId,
      envelope,
      createdAt: new Date(),
      rotatedAt: null,
      expiresAt: null,
    };
    this.secrets.set(providerId, stored);
    return stored;
  }

  async retrieve(providerId: string): Promise<StoredSecret | null> {
    return this.secrets.get(providerId) ?? null;
  }

  async rotate(providerId: string, newEnvelope: EncryptedEnvelope): Promise<StoredSecret> {
    const existing = this.secrets.get(providerId);
    const stored: StoredSecret = {
      id: existing?.id ?? `secret-${providerId}`,
      providerId,
      envelope: newEnvelope,
      createdAt: existing?.createdAt ?? new Date(),
      rotatedAt: new Date(),
      expiresAt: null,
    };
    this.secrets.set(providerId, stored);
    return stored;
  }

  async revoke(providerId: string): Promise<void> {
    this.secrets.delete(providerId);
  }

  async exists(providerId: string): Promise<boolean> {
    return this.secrets.has(providerId);
  }
}

describe('SecretRotationService', () => {
  const key = randomBytes(32);
  const resolver = makeInMemoryKeyResolver(key);

  it('rotateSecret throws if no secret exists for the provider', async () => {
    const store = new InMemorySecretStore();
    const service = new SecretRotationService(store, resolver);

    await expect(service.rotateSecret('unknown', 'new-value')).rejects.toThrow(
      'No secret found for provider: unknown'
    );
  });

  it('rotateSecret succeeds when a secret exists', async () => {
    const store = new InMemorySecretStore();
    const service = new SecretRotationService(store, resolver);

    // Seed a secret first
    const { encrypt } = await import('../crypto/encrypt.js');
    const envelope = await encrypt('old-value', resolver);
    await store.store('provider-1', envelope);

    const result = await service.rotateSecret('provider-1', 'new-value');

    expect(result.providerId).toBe('provider-1');
    expect(result.success).toBe(true);
    expect(result.newKeyId).toBe('test-key-1');
    expect(result.rotatedAt).toBeInstanceOf(Date);
  });

  it('reencryptWithCurrentKey works without an existing secret', async () => {
    const store = new InMemorySecretStore();
    const service = new SecretRotationService(store, resolver);

    const result = await service.reencryptWithCurrentKey('provider-2', 'plaintext-value');

    expect(result.providerId).toBe('provider-2');
    expect(result.success).toBe(true);
    expect(result.newKeyId).toBe('test-key-1');

    // Verify the store was updated
    const stored = await store.retrieve('provider-2');
    expect(stored).not.toBeNull();
    expect(stored!.envelope.keyId).toBe('test-key-1');
  });

  it('rotateSecret updates the stored envelope', async () => {
    const store = new InMemorySecretStore();
    const service = new SecretRotationService(store, resolver);

    const { encrypt } = await import('../crypto/encrypt.js');
    const oldEnvelope = await encrypt('old', resolver);
    await store.store('provider-3', oldEnvelope);

    await service.rotateSecret('provider-3', 'new');

    const stored = await store.retrieve('provider-3');
    expect(stored!.envelope.ciphertext).not.toBe(oldEnvelope.ciphertext);
  });
});
