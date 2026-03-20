import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretRotationService } from './SecretRotationService.js';
import { PgSecretCipherStore } from '@acds/persistence-pg';
import type { KeyResolver, KeyMaterial } from '../crypto/keyResolver.js';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE provider_secrets CASCADE');
});

afterAll(async () => {
  await closePool();
});

function makeKeyResolver(keyBuffer: Buffer, keyId = 'test-key-1'): KeyResolver {
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

describe('SecretRotationService', () => {
  const key = randomBytes(32);
  const resolver = makeKeyResolver(key);

  it('rotateSecret throws if no secret exists for the provider', async () => {
    const store = new PgSecretCipherStore(pool as any);
    const service = new SecretRotationService(store, resolver);

    await expect(service.rotateSecret('unknown', 'new-value')).rejects.toThrow(
      'No secret found for provider: unknown'
    );
  });

  it('rotateSecret succeeds when a secret exists', async () => {
    const store = new PgSecretCipherStore(pool as any);
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
    const store = new PgSecretCipherStore(pool as any);
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
    const store = new PgSecretCipherStore(pool as any);
    const service = new SecretRotationService(store, resolver);

    const { encrypt } = await import('../crypto/encrypt.js');
    const oldEnvelope = await encrypt('old', resolver);
    await store.store('provider-3', oldEnvelope);

    await service.rotateSecret('provider-3', 'new');

    const stored = await store.retrieve('provider-3');
    expect(stored!.envelope.ciphertext).not.toBe(oldEnvelope.ciphertext);
  });
});
