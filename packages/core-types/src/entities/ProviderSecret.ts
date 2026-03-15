export interface ProviderSecret {
  id: string;
  providerId: string;
  ciphertextBlob: string;
  keyId: string;
  algorithm: string;
  createdAt: Date;
  rotatedAt: Date | null;
  expiresAt: Date | null;
}
