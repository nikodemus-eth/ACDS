import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt } from './encrypt.js';
import type { KeyResolver, KeyMaterial } from './keyResolver.js';
import { DEFAULT_CIPHER_CONFIG } from './cipherTypes.js';

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

describe('encrypt', () => {
  const key = randomBytes(32);
  const resolver = makeInMemoryKeyResolver(key);

  it('returns an EncryptedEnvelope with all required fields', async () => {
    const envelope = await encrypt('hello world', resolver);

    expect(envelope).toHaveProperty('ciphertext');
    expect(envelope).toHaveProperty('iv');
    expect(envelope).toHaveProperty('authTag');
    expect(envelope).toHaveProperty('keyId', 'test-key-1');
    expect(envelope).toHaveProperty('algorithm', DEFAULT_CIPHER_CONFIG.algorithm);
  });

  it('produces base64-encoded ciphertext, iv, and authTag', async () => {
    const envelope = await encrypt('test data', resolver);

    // All three should be valid base64 strings
    expect(() => Buffer.from(envelope.ciphertext, 'base64')).not.toThrow();
    expect(() => Buffer.from(envelope.iv, 'base64')).not.toThrow();
    expect(() => Buffer.from(envelope.authTag, 'base64')).not.toThrow();

    // IV should be 12 bytes for AES-256-GCM
    expect(Buffer.from(envelope.iv, 'base64').length).toBe(12);
    // Auth tag should be 16 bytes
    expect(Buffer.from(envelope.authTag, 'base64').length).toBe(16);
  });

  it('ciphertext differs from plaintext', async () => {
    const plaintext = 'sensitive information';
    const envelope = await encrypt(plaintext, resolver);
    const decoded = Buffer.from(envelope.ciphertext, 'base64').toString('utf8');
    expect(decoded).not.toBe(plaintext);
  });

  it('produces unique IVs for each encryption', async () => {
    const e1 = await encrypt('same text', resolver);
    const e2 = await encrypt('same text', resolver);
    expect(e1.iv).not.toBe(e2.iv);
  });

  it('throws on key length mismatch', async () => {
    const shortKey = randomBytes(16);
    const badResolver = makeInMemoryKeyResolver(shortKey);

    await expect(encrypt('data', badResolver)).rejects.toThrow('Key length mismatch');
  });

  it('encrypts empty string', async () => {
    const envelope = await encrypt('', resolver);
    expect(envelope.ciphertext).toBeDefined();
    expect(typeof envelope.ciphertext).toBe('string');
  });

  it('encrypts unicode text', async () => {
    const envelope = await encrypt('hello 🌍 wörld', resolver);
    expect(envelope.ciphertext).toBeDefined();
  });

  it('uses the keyId from the resolver', async () => {
    const customResolver = makeInMemoryKeyResolver(key, 'custom-key-42');
    const envelope = await encrypt('data', customResolver);
    expect(envelope.keyId).toBe('custom-key-42');
  });
});
