import { describe, it, expect } from 'vitest';
import { REDACTED, SENSITIVE_TOKENS, tokenizeKey, redactInlineSecrets } from './sharedRedaction.js';

describe('REDACTED constant', () => {
  it('equals [REDACTED]', () => {
    expect(REDACTED).toBe('[REDACTED]');
  });
});

describe('SENSITIVE_TOKENS', () => {
  it('contains expected sensitive tokens', () => {
    const expected = [
      'api', 'auth', 'authorization', 'cipher', 'ciphertext',
      'credential', 'key', 'master', 'password', 'plaintext',
      'private', 'secret', 'token',
    ];
    for (const token of expected) {
      expect(SENSITIVE_TOKENS.has(token)).toBe(true);
    }
  });
});

describe('tokenizeKey', () => {
  it('splits camelCase into lowercase tokens', () => {
    expect(tokenizeKey('apiKey')).toEqual(['api', 'key']);
  });

  it('splits snake_case into lowercase tokens', () => {
    expect(tokenizeKey('api_key')).toEqual(['api', 'key']);
  });

  it('splits kebab-case into lowercase tokens', () => {
    expect(tokenizeKey('api-key')).toEqual(['api', 'key']);
  });

  it('splits PascalCase into lowercase tokens', () => {
    expect(tokenizeKey('MasterPassword')).toEqual(['master', 'password']);
  });

  it('handles single word', () => {
    expect(tokenizeKey('name')).toEqual(['name']);
  });

  it('handles empty string', () => {
    expect(tokenizeKey('')).toEqual([]);
  });

  it('handles multiple separators', () => {
    expect(tokenizeKey('my__secret__key')).toEqual(['my', 'secret', 'key']);
  });

  it('handles mixed camelCase and separators', () => {
    expect(tokenizeKey('mySecretApi_key')).toEqual(['my', 'secret', 'api', 'key']);
  });
});

describe('redactInlineSecrets', () => {
  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig';
    const result = redactInlineSecrets(input);
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts Basic auth', () => {
    const input = 'Authorization: Basic dXNlcjpwYXNz';
    const result = redactInlineSecrets(input);
    expect(result).toContain('Basic [REDACTED]');
    expect(result).not.toContain('dXNlcjpwYXNz');
  });

  it('redacts key=value patterns', () => {
    const input = 'api_key=abc123xyz';
    const result = redactInlineSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('abc123xyz');
  });

  it('redacts secret: value patterns', () => {
    const input = 'secret: mysecretvalue';
    const result = redactInlineSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('mysecretvalue');
  });

  it('redacts token=value patterns', () => {
    const input = 'token=mytoken123';
    const result = redactInlineSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('mytoken123');
  });

  it('redacts password=value patterns', () => {
    const input = 'password=hunter2';
    const result = redactInlineSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('hunter2');
  });

  it('redacts JSON-like key-value pairs', () => {
    const input = '"apiKey": "sk-super-secret-123"';
    const result = redactInlineSecrets(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-super-secret-123');
  });

  it('redacts sk- prefixed keys', () => {
    const input = 'The key is sk-proj-abc123xyz456';
    const result = redactInlineSecrets(input);
    expect(result).not.toContain('sk-proj-abc123xyz456');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts credentials in URLs', () => {
    const input = 'Connect to https://admin:password123@db.example.com:5432/mydb';
    const result = redactInlineSecrets(input);
    expect(result).not.toContain('admin:password123');
    expect(result).toContain('https://[REDACTED]:[REDACTED]@');
  });

  it('returns string unchanged when no secrets present', () => {
    const input = 'This is a normal log message with no secrets';
    const result = redactInlineSecrets(input);
    expect(result).toBe(input);
  });

  it('handles empty string', () => {
    expect(redactInlineSecrets('')).toBe('');
  });

  it('handles multiple secrets in one string', () => {
    const input = 'Bearer token123 and key=secret456 and sk-abc';
    const result = redactInlineSecrets(input);
    expect(result).not.toContain('token123');
    expect(result).not.toContain('secret456');
    expect(result).not.toContain('sk-abc');
  });

  it('is case insensitive for Bearer and Basic', () => {
    expect(redactInlineSecrets('BEARER mytoken')).toContain('[REDACTED]');
    expect(redactInlineSecrets('basic dXNlcjpwYXNz')).toContain('[REDACTED]');
  });
});
