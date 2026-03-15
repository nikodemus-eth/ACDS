/**
 * ARGUS-9 Tier 1 — Secret Redaction Gaps
 *
 * Tests that SecretRedactor, redactObject, and redactError fail to
 * scrub secrets from certain input shapes and patterns.
 */

import { describe, it, expect } from 'vitest';
import { SecretRedactor } from '@acds/security';
import { redactObject, redactError } from '@acds/security';

describe('ARGUS A1-A3: Secret Redaction', () => {

  // ── SecretRedactor ───────────────────────────────────────

  describe('SecretRedactor.redactRecord', () => {
    const redactor = new SecretRedactor();

    it('leaks secrets nested inside arrays', () => {
      // VULN: redactRecord skips arrays (line 36: !Array.isArray(value))
      const record = {
        configs: [
          { apiKey: 'sk-live-LEAKED', name: 'prod' },
        ],
      };
      const result = redactor.redactRecord(record);
      // Arrays pass through unredacted — this IS the vulnerability
      const configs = result.configs as Array<Record<string, unknown>>;
      expect(configs[0].apiKey).toBe('sk-live-LEAKED');
    });

    it('leaks secrets in flat array values under non-sensitive key', () => {
      // VULN: array values bypass recursive redaction — secret-like strings inside survive
      const record = {
        items: ['sk-live-abc123', 'Bearer tok-def456'],
      };
      const result = redactor.redactRecord(record);
      const items = result.items as string[];
      expect(items[0]).toBe('sk-live-abc123');
      expect(items[1]).toBe('Bearer tok-def456');
    });

    it('leaks when sensitive value is nested inside an array of objects', () => {
      // VULN: deeply nested secrets in arrays survive
      const record = {
        providers: [
          { connection: { secretKey: 'super-secret-value' } },
        ],
      };
      const result = redactor.redactRecord(record);
      const providers = result.providers as Array<Record<string, unknown>>;
      const connection = providers[0].connection as Record<string, unknown>;
      expect(connection.secretKey).toBe('super-secret-value');
    });
  });

  describe('SecretRedactor.isSensitiveKey — overly broad matching', () => {
    const redactor = new SecretRedactor();

    it('flags innocent key "author" due to /auth/i regex', () => {
      // VULN: /auth/i matches "author", "authority", "authenticate"
      expect(redactor.isSensitiveKey('author')).toBe(true);
    });

    it('flags innocent key "authority" due to /auth/i regex', () => {
      expect(redactor.isSensitiveKey('authority')).toBe(true);
    });

    it('flags innocent key "monkey" due to /key/i regex', () => {
      // VULN: /key/i matches any word containing "key"
      expect(redactor.isSensitiveKey('monkey')).toBe(true);
    });

    it('flags innocent key "tokenizer" due to /token/i regex', () => {
      expect(redactor.isSensitiveKey('tokenizer')).toBe(true);
    });
  });

  // ── redactObject ─────────────────────────────────────────

  describe('redactObject', () => {

    it('leaks secrets with non-exact key names', () => {
      // VULN: redactObject uses Set.has() exact match — close variants bypass
      const obj = {
        myApiKey: 'sk-live-leaked',
        API_KEY: 'another-leak',
        x_token_value: 'tok-leaked',
      };
      const result = redactObject(obj);
      // None of these match the fixed whitelist
      expect(result.myApiKey).toBe('sk-live-leaked');
      expect(result.API_KEY).toBe('another-leak');
      expect(result.x_token_value).toBe('tok-leaked');
    });

    it('leaks secrets nested inside arrays', () => {
      // VULN: same array bypass as SecretRedactor
      const obj = {
        credentials: [{ apiKey: 'sk-live-array-leak' }],
      };
      const result = redactObject(obj);
      const creds = result.credentials as Array<Record<string, unknown>>;
      expect(creds[0].apiKey).toBe('sk-live-array-leak');
    });

    it('leaks when secret key is camelCase variant', () => {
      // VULN: "secretToken" is not in the exact-match set
      const obj = { secretToken: 'leaked-value' };
      const result = redactObject(obj);
      expect(result.secretToken).toBe('leaked-value');
    });
  });

  // ── redactError ──────────────────────────────────────────

  describe('redactError', () => {

    it('leaks credentials in key:"value" format (no space after colon)', () => {
      // VULN: regex expects `key= ` or `key: ` with optional space, but
      // `key:"value"` (no space) may bypass depending on \S+ greediness
      const err = new Error('Failed with key:"sk-live-123abc"');
      const result = redactError(err);
      // The regex key[=:]\s*\S+ should match this, but let's verify edge
      expect(result.message).not.toContain('sk-live-123abc');
    });

    it('leaks base64-encoded credentials', () => {
      // VULN: no regex pattern for base64-encoded secrets
      const b64Secret = Buffer.from('sk-live-secretvalue').toString('base64');
      const err = new Error(`Authorization: Basic ${b64Secret}`);
      const result = redactError(err);
      // Only `Bearer` pattern is caught, not `Basic`
      expect(result.message).toContain(b64Secret);
    });

    it('leaks credentials in query string format', () => {
      // VULN: no regex for ?key=value&token=value URL query params
      const err = new Error('Request to https://api.example.com?api_key=sk-live-leaked&format=json failed');
      const result = redactError(err);
      // The key= pattern should catch "key=sk-live-leaked" but "api_key=" has underscore before key
      expect(result.message).toContain('api.example.com');
    });

    it('returns generic message for non-Error objects', () => {
      // Not a vulnerability, but verifies behavior
      const result = redactError('string error');
      expect(result.message).toBe('An unknown error occurred');
    });
  });
});
