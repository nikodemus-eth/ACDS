export interface CipherConfig {
  algorithm: string;
  keyLengthBytes: number;
  ivLengthBytes: number;
  authTagLengthBytes: number;
}

export const DEFAULT_CIPHER_CONFIG: CipherConfig = {
  algorithm: 'aes-256-gcm',
  keyLengthBytes: 32,
  ivLengthBytes: 12,
  authTagLengthBytes: 16,
};

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
  algorithm: string;
}
