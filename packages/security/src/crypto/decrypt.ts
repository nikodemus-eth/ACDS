import { createDecipheriv } from 'node:crypto';
import type { CipherConfig, EncryptedEnvelope } from './cipherTypes.js';
import type { KeyResolver } from './keyResolver.js';
import { DEFAULT_CIPHER_CONFIG } from './cipherTypes.js';

export async function decrypt(
  envelope: EncryptedEnvelope,
  keyResolver: KeyResolver,
  config: CipherConfig = DEFAULT_CIPHER_CONFIG
): Promise<string> {
  const { keyBuffer } = await keyResolver.resolveKeyById(envelope.keyId);

  if (keyBuffer.length !== config.keyLengthBytes) {
    throw new Error(
      `Key length mismatch: expected ${config.keyLengthBytes} bytes, got ${keyBuffer.length}`
    );
  }

  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

  const decipher = createDecipheriv(config.algorithm, keyBuffer, iv, {
    authTagLength: config.authTagLengthBytes,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
