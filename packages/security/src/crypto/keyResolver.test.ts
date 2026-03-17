import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileKeyResolver, EnvironmentKeyResolver } from './keyResolver.js';

describe('FileKeyResolver', () => {
  const tmpFiles: string[] = [];

  afterEach(async () => {
    for (const f of tmpFiles) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

  it('resolveCurrentKey reads a key from a file', async () => {
    const key = randomBytes(32);
    const path = join(tmpdir(), `acds-test-key-${Date.now()}.bin`);
    tmpFiles.push(path);
    await writeFile(path, key);

    const resolver = new FileKeyResolver(path, 'file-key-1');
    const result = await resolver.resolveCurrentKey();

    expect(result.keyId).toBe('file-key-1');
    expect(Buffer.compare(result.keyBuffer, key)).toBe(0);
  });

  it('resolveKeyById returns the key when ID matches', async () => {
    const key = randomBytes(32);
    const path = join(tmpdir(), `acds-test-key-${Date.now()}.bin`);
    tmpFiles.push(path);
    await writeFile(path, key);

    const resolver = new FileKeyResolver(path, 'my-key');
    const result = await resolver.resolveKeyById('my-key');

    expect(result.keyId).toBe('my-key');
    expect(Buffer.compare(result.keyBuffer, key)).toBe(0);
  });

  it('resolveKeyById throws when ID does not match', async () => {
    const key = randomBytes(32);
    const path = join(tmpdir(), `acds-test-key-${Date.now()}.bin`);
    tmpFiles.push(path);
    await writeFile(path, key);

    const resolver = new FileKeyResolver(path, 'my-key');
    await expect(resolver.resolveKeyById('wrong-key')).rejects.toThrow('Unknown key ID');
  });

  it('uses default keyId when none is provided', async () => {
    const key = randomBytes(32);
    const path = join(tmpdir(), `acds-test-key-${Date.now()}.bin`);
    tmpFiles.push(path);
    await writeFile(path, key);

    const resolver = new FileKeyResolver(path);
    const result = await resolver.resolveCurrentKey();
    expect(result.keyId).toBe('master-key-1');
  });

  it('throws when file does not exist', async () => {
    const resolver = new FileKeyResolver('/tmp/nonexistent-key-file-acds.bin');
    await expect(resolver.resolveCurrentKey()).rejects.toThrow();
  });
});

describe('EnvironmentKeyResolver', () => {
  const envVarsToClean: string[] = [];

  afterEach(() => {
    for (const v of envVarsToClean) {
      delete process.env[v];
    }
    envVarsToClean.length = 0;
  });

  it('resolveCurrentKey reads a hex key from environment', async () => {
    const key = randomBytes(32);
    const envVar = `ACDS_TEST_KEY_${Date.now()}`;
    envVarsToClean.push(envVar);
    process.env[envVar] = key.toString('hex');

    const resolver = new EnvironmentKeyResolver(envVar, 'env-key-1');
    const result = await resolver.resolveCurrentKey();

    expect(result.keyId).toBe('env-key-1');
    expect(Buffer.compare(result.keyBuffer, key)).toBe(0);
  });

  it('resolveKeyById returns the key when ID matches', async () => {
    const key = randomBytes(32);
    const envVar = `ACDS_TEST_KEY2_${Date.now()}`;
    envVarsToClean.push(envVar);
    process.env[envVar] = key.toString('hex');

    const resolver = new EnvironmentKeyResolver(envVar, 'env-key-1');
    const result = await resolver.resolveKeyById('env-key-1');

    expect(result.keyId).toBe('env-key-1');
  });

  it('resolveKeyById throws when ID does not match', async () => {
    const envVar = `ACDS_TEST_KEY3_${Date.now()}`;
    envVarsToClean.push(envVar);
    process.env[envVar] = randomBytes(32).toString('hex');

    const resolver = new EnvironmentKeyResolver(envVar, 'env-key-1');
    await expect(resolver.resolveKeyById('wrong-id')).rejects.toThrow('Unknown key ID');
  });

  it('throws when environment variable is not set', async () => {
    const resolver = new EnvironmentKeyResolver('DEFINITELY_NOT_SET_VAR_ACDS');
    await expect(resolver.resolveCurrentKey()).rejects.toThrow('is not set');
  });

  it('uses default envVar and keyId when none provided', async () => {
    const key = randomBytes(32);
    envVarsToClean.push('MASTER_KEY');
    process.env['MASTER_KEY'] = key.toString('hex');

    const resolver = new EnvironmentKeyResolver();
    const result = await resolver.resolveCurrentKey();
    expect(result.keyId).toBe('env-key-1');
    expect(Buffer.compare(result.keyBuffer, key)).toBe(0);
  });
});
