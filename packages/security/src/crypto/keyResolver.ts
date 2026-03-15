import { readFile } from 'node:fs/promises';

export interface KeyMaterial {
  keyId: string;
  keyBuffer: Buffer;
}

export interface KeyResolver {
  resolveCurrentKey(): Promise<KeyMaterial>;
  resolveKeyById(keyId: string): Promise<KeyMaterial>;
}

export class FileKeyResolver implements KeyResolver {
  private readonly keyPath: string;
  private readonly keyId: string;

  constructor(keyPath: string, keyId: string = 'master-key-1') {
    this.keyPath = keyPath;
    this.keyId = keyId;
  }

  async resolveCurrentKey(): Promise<KeyMaterial> {
    const keyBuffer = await readFile(this.keyPath);
    return { keyId: this.keyId, keyBuffer };
  }

  async resolveKeyById(keyId: string): Promise<KeyMaterial> {
    if (keyId !== this.keyId) {
      throw new Error(`Unknown key ID: ${keyId}. Key rotation with multiple keys requires an extended resolver.`);
    }
    return this.resolveCurrentKey();
  }
}

export class EnvironmentKeyResolver implements KeyResolver {
  private readonly envVar: string;
  private readonly keyId: string;

  constructor(envVar: string = 'MASTER_KEY', keyId: string = 'env-key-1') {
    this.envVar = envVar;
    this.keyId = keyId;
  }

  async resolveCurrentKey(): Promise<KeyMaterial> {
    const hexKey = process.env[this.envVar];
    if (!hexKey) {
      throw new Error(`Environment variable ${this.envVar} is not set`);
    }
    const keyBuffer = Buffer.from(hexKey, 'hex');
    return { keyId: this.keyId, keyBuffer };
  }

  async resolveKeyById(keyId: string): Promise<KeyMaterial> {
    if (keyId !== this.keyId) {
      throw new Error(`Unknown key ID: ${keyId}`);
    }
    return this.resolveCurrentKey();
  }
}
