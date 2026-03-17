import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt } from './encrypt.js';
import { decrypt } from './decrypt.js';
import type { KeyResolver, KeyMaterial } from './keyResolver.js';

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

describe('decrypt', () => {
  const key = randomBytes(32);
  const resolver = makeInMemoryKeyResolver(key);

  it('round-trips plaintext through encrypt then decrypt', async () => {
    const plaintext = 'hello world';
    const envelope = await encrypt(plaintext, resolver);
    const result = await decrypt(envelope, resolver);
    expect(result).toBe(plaintext);
  });

  it('round-trips empty string', async () => {
    const envelope = await encrypt('', resolver);
    const result = await decrypt(envelope, resolver);
    expect(result).toBe('');
  });

  it('round-trips unicode text', async () => {
    const plaintext = 'Ünïcödé 🎉 テスト';
    const envelope = await encrypt(plaintext, resolver);
    const result = await decrypt(envelope, resolver);
    expect(result).toBe(plaintext);
  });

  it('round-trips long text', async () => {
    const plaintext = 'x'.repeat(100_000);
    const envelope = await encrypt(plaintext, resolver);
    const result = await decrypt(envelope, resolver);
    expect(result).toBe(plaintext);
  });

  it('fails with wrong key', async () => {
    const envelope = await encrypt('secret', resolver);
    const wrongKey = randomBytes(32);
    const wrongResolver = makeInMemoryKeyResolver(wrongKey);

    await expect(decrypt(envelope, wrongResolver)).rejects.toThrow();
  });

  it('fails with tampered ciphertext', async () => {
    const envelope = await encrypt('secret', resolver);
    const tampered = { ...envelope, ciphertext: 'AAAA' + envelope.ciphertext.slice(4) };

    await expect(decrypt(tampered, resolver)).rejects.toThrow();
  });

  it('fails with tampered authTag', async () => {
    const envelope = await encrypt('secret', resolver);
    const buf = Buffer.from(envelope.authTag, 'base64');
    buf[0] = buf[0]! ^ 0xff;
    const tampered = { ...envelope, authTag: buf.toString('base64') };

    await expect(decrypt(tampered, resolver)).rejects.toThrow();
  });

  it('throws on key length mismatch', async () => {
    const envelope = await encrypt('data', resolver);
    const shortKey = randomBytes(16);
    const badResolver = makeInMemoryKeyResolver(shortKey);

    await expect(decrypt(envelope, badResolver)).rejects.toThrow('Key length mismatch');
  });

  it('throws when keyId is unknown', async () => {
    const envelope = await encrypt('data', resolver);
    const mismatchedEnvelope = { ...envelope, keyId: 'unknown-key' };

    await expect(decrypt(mismatchedEnvelope, resolver)).rejects.toThrow('Unknown key ID');
  });
});
