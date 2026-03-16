import { randomBytes, createCipheriv } from 'node:crypto';
import type { CipherConfig, EncryptedEnvelope } from './cipherTypes.js';
import type { KeyResolver } from './keyResolver.js';
import { DEFAULT_CIPHER_CONFIG } from './cipherTypes.js';

export async function encrypt(
  plaintext: string,
  keyResolver: KeyResolver,
  config: CipherConfig = DEFAULT_CIPHER_CONFIG
): Promise<EncryptedEnvelope> {
  const { keyId, keyBuffer } = await keyResolver.resolveCurrentKey();

  if (keyBuffer.length !== config.keyLengthBytes) {
    throw new Error(
      `Key length mismatch: expected ${config.keyLengthBytes} bytes, got ${keyBuffer.length}`
    );
  }

  const iv = randomBytes(config.ivLengthBytes);
  const cipher = createCipheriv(
    config.algorithm as 'aes-256-gcm',
    keyBuffer,
    iv,
    { authTagLength: config.authTagLengthBytes } as any,
  );

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId,
    algorithm: config.algorithm,
  };
}
