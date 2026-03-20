import { describe, it, expect } from 'vitest';
import { DEFAULT_CIPHER_CONFIG } from './cipherTypes.js';
import type { CipherConfig, EncryptedEnvelope } from './cipherTypes.js';

describe('cipherTypes', () => {
  it('DEFAULT_CIPHER_CONFIG has correct values', () => {
    expect(DEFAULT_CIPHER_CONFIG.algorithm).toBe('aes-256-gcm');
    expect(DEFAULT_CIPHER_CONFIG.keyLengthBytes).toBe(32);
    expect(DEFAULT_CIPHER_CONFIG.ivLengthBytes).toBe(12);
    expect(DEFAULT_CIPHER_CONFIG.authTagLengthBytes).toBe(16);
  });

  it('CipherConfig type is structurally valid', () => {
    const config: CipherConfig = {
      algorithm: 'aes-128-gcm',
      keyLengthBytes: 16,
      ivLengthBytes: 12,
      authTagLengthBytes: 16,
    };
    expect(config.algorithm).toBe('aes-128-gcm');
  });

  it('EncryptedEnvelope type is structurally valid', () => {
    const envelope: EncryptedEnvelope = {
      ciphertext: 'abc',
      iv: 'def',
      authTag: 'ghi',
      keyId: 'key-1',
      algorithm: 'aes-256-gcm',
    };
    expect(envelope.keyId).toBe('key-1');
  });
});
