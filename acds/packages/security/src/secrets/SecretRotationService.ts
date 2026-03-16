import type { SecretCipherStore } from './SecretCipherStore.js';
import type { KeyResolver } from '../crypto/keyResolver.js';
import { encrypt } from '../crypto/encrypt.js';

export interface RotationResult {
  providerId: string;
  rotatedAt: Date;
  newKeyId: string;
  success: boolean;
  errorMessage?: string;
}

export class SecretRotationService {
  constructor(
    private readonly store: SecretCipherStore,
    private readonly keyResolver: KeyResolver
  ) {}

  async rotateSecret(providerId: string, newPlaintext: string): Promise<RotationResult> {
    const existing = await this.store.retrieve(providerId);
    if (!existing) {
      throw new Error(`No secret found for provider: ${providerId}`);
    }

    const newEnvelope = await encrypt(newPlaintext, this.keyResolver);
    await this.store.rotate(providerId, newEnvelope);

    return {
      providerId,
      rotatedAt: new Date(),
      newKeyId: newEnvelope.keyId,
      success: true,
    };
  }

  async reencryptWithCurrentKey(providerId: string, decryptedPlaintext: string): Promise<RotationResult> {
    const newEnvelope = await encrypt(decryptedPlaintext, this.keyResolver);
    await this.store.rotate(providerId, newEnvelope);

    return {
      providerId,
      rotatedAt: new Date(),
      newKeyId: newEnvelope.keyId,
      success: true,
    };
  }
}
