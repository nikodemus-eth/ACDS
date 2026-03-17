import { describe, it, expect } from 'vitest';
import { SecretRedactor } from './SecretRedactor.js';

describe('SecretRedactor', () => {
  describe('isSensitiveKey', () => {
    const redactor = new SecretRedactor();

    it('detects camelCase sensitive keys', () => {
      expect(redactor.isSensitiveKey('apiKey')).toBe(true);
      expect(redactor.isSensitiveKey('authToken')).toBe(true);
      expect(redactor.isSensitiveKey('userPassword')).toBe(true);
    });

    it('detects snake_case sensitive keys', () => {
      expect(redactor.isSensitiveKey('api_key')).toBe(true);
      expect(redactor.isSensitiveKey('auth_token')).toBe(true);
      expect(redactor.isSensitiveKey('master_secret')).toBe(true);
    });

    it('returns false for non-sensitive keys', () => {
      expect(redactor.isSensitiveKey('name')).toBe(false);
      expect(redactor.isSensitiveKey('host')).toBe(false);
      expect(redactor.isSensitiveKey('port')).toBe(false);
    });

    it('respects additionalSensitiveTokens', () => {
      const custom = new SecretRedactor(['ssn', 'dob']);
      expect(custom.isSensitiveKey('user_ssn')).toBe(true);
      expect(custom.isSensitiveKey('userDob')).toBe(true);
      expect(custom.isSensitiveKey('name')).toBe(false);
    });

    it('additionalSensitiveTokens are case-insensitive', () => {
      const custom = new SecretRedactor(['CUSTOM']);
      expect(custom.isSensitiveKey('myCustomField')).toBe(true);
    });
  });

  describe('redactValue', () => {
    const redactor = new SecretRedactor();

    it('redacts values of sensitive keys', () => {
      expect(redactor.redactValue('apiKey', 'sk-1234')).toBe('[REDACTED]');
      expect(redactor.redactValue('password', 'supersecret')).toBe('[REDACTED]');
    });

    it('passes through non-sensitive string values unchanged (when no inline secrets)', () => {
      expect(redactor.redactValue('hostname', 'example.com')).toBe('example.com');
    });

    it('redacts inline secrets in non-sensitive string values', () => {
      const val = redactor.redactValue('message', 'Bearer abc123');
      expect(val).toBe('Bearer [REDACTED]');
    });

    it('redacts values in arrays recursively', () => {
      const result = redactor.redactValue('items', ['Bearer xyz']);
      expect(result).toEqual(['Bearer [REDACTED]']);
    });

    it('redacts nested objects recursively', () => {
      const result = redactor.redactValue('config', { apiKey: 'secret', host: 'example.com' });
      expect(result).toEqual({ apiKey: '[REDACTED]', host: 'example.com' });
    });

    it('passes through numbers and booleans', () => {
      expect(redactor.redactValue('count', 42)).toBe(42);
      expect(redactor.redactValue('enabled', true)).toBe(true);
    });

    it('passes through null', () => {
      expect(redactor.redactValue('data', null)).toBe(null);
    });
  });

  describe('redactRecord', () => {
    const redactor = new SecretRedactor();

    it('redacts sensitive keys in a flat record', () => {
      const record = { name: 'test', apiKey: 'sk-123', host: 'example.com' };
      const result = redactor.redactRecord(record);
      expect(result).toEqual({
        name: 'test',
        apiKey: '[REDACTED]',
        host: 'example.com',
      });
    });

    it('redacts nested objects under non-sensitive keys', () => {
      const record = {
        config: { password: 'secret', host: 'example.com' },
      };
      const result = redactor.redactRecord(record);
      expect(result).toEqual({
        config: { password: '[REDACTED]', host: 'example.com' },
      });
    });

    it('redacts inline secrets in string values', () => {
      const record = { log: 'key=abc123 data' };
      const result = redactor.redactRecord(record);
      expect(result.log).toContain('[REDACTED]');
    });

    it('redacts sk- tokens in strings', () => {
      const record = { message: 'used sk-abc123XYZ for auth' };
      const result = redactor.redactRecord(record);
      expect(result.message).toContain('[REDACTED]');
      expect(result.message).not.toContain('sk-abc123XYZ');
    });

    it('redacts credentials in URLs', () => {
      const record = { endpoint: 'https://user:pass@host.com/path' };
      const result = redactor.redactRecord(record);
      expect(result.endpoint).toContain('[REDACTED]');
      expect(result.endpoint).not.toContain('user:pass');
    });

    it('handles arrays inside records', () => {
      const record = { tokens: ['Bearer abc', 'safe'] };
      const result = redactor.redactRecord(record);
      expect(result.tokens).toEqual(['Bearer [REDACTED]', 'safe']);
    });

    it('handles empty record', () => {
      expect(redactor.redactRecord({})).toEqual({});
    });
  });
});
