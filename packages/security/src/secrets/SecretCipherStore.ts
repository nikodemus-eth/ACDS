import type { EncryptedEnvelope } from '../crypto/cipherTypes.js';

export interface StoredSecret {
  id: string;
  providerId: string;
  envelope: EncryptedEnvelope;
  createdAt: Date;
  rotatedAt: Date | null;
  expiresAt: Date | null;
}

export interface SecretCipherStore {
  store(providerId: string, envelope: EncryptedEnvelope): Promise<StoredSecret>;
  retrieve(providerId: string): Promise<StoredSecret | null>;
  rotate(providerId: string, newEnvelope: EncryptedEnvelope): Promise<StoredSecret>;
  revoke(providerId: string): Promise<void>;
  exists(providerId: string): Promise<boolean>;
}
