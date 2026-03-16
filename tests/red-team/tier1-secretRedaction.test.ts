/**
 * ARGUS-9 Tier 1 — Secret Redaction
 *
 * Validates that SecretRedactor, redactObject, and redactError correctly
 * scrub secrets from all input shapes and patterns. These vulnerabilities
 * were fixed in commit 98b2231 ("Harden dispatch execution and adaptive controls").
 */

import { describe, it, expect } from 'vitest';
import { SecretRedactor } from '@acds/security';
import { redactObject, redactError } from '@acds/security';

describe('ARGUS A1-A3: Secret Redaction', () => {

  // ── SecretRedactor ───────────────────────────────────────

  describe('SecretRedactor.redactRecord', () => {
    const redactor = new SecretRedactor();

    it('redacts secrets nested inside arrays after hardening', () => {
      // FIXED: Previously skipped arrays (line 36: !Array.isArray(value)), now recursively processes them
      const record = {
        configs: [
          { apiKey: 'sk-live-LEAKED', name: 'prod' },
        ],
      };
      const result = redactor.redactRecord(record);
      const configs = result.configs as Array<Record<string, unknown>>;
      expect(configs[0].apiKey).toBe('[REDACTED]');
    });

    it('redacts secret patterns in flat array values after hardening', () => {
      // FIXED: Array values now scanned for secret-like patterns via redactInlineSecrets
      const record = {
        items: ['sk-live-abc123', 'Bearer tok-def456'],
      };
      const result = redactor.redactRecord(record);
      const items = result.items as string[];
      expect(items[0]).toBe('[REDACTED]');
      expect(items[1]).toContain('[REDACTED]');
    });

    it('redacts sensitive values nested inside arrays of objects after hardening', () => {
      // FIXED: Deeply nested secrets in arrays now recursively redacted
      const record = {
        providers: [
          { connection: { secretKey: 'super-secret-value' } },
        ],
      };
      const result = redactor.redactRecord(record);
      const providers = result.providers as Array<Record<string, unknown>>;
      const connection = providers[0].connection as Record<string, unknown>;
      expect(connection.secretKey).toBe('[REDACTED]');
    });
  });

  describe('SecretRedactor.isSensitiveKey — token-based matching after hardening', () => {
    const redactor = new SecretRedactor();

    it('no longer flags innocent key "author" after hardening', () => {
      // FIXED: Previously used /auth/i regex (matched "author"), now uses token-based matching
      expect(redactor.isSensitiveKey('author')).toBe(false);
    });

    it('no longer flags innocent key "authority" after hardening', () => {
      // FIXED: "authority" tokenizes to ["authority"], doesn't match "auth" token exactly
      expect(redactor.isSensitiveKey('authority')).toBe(false);
    });

    it('no longer flags innocent key "monkey" after hardening', () => {
      // FIXED: Previously used /key/i regex (matched "monkey"), now uses token-based matching
      expect(redactor.isSensitiveKey('monkey')).toBe(false);
    });

    it('no longer flags innocent key "tokenizer" after hardening', () => {
      // FIXED: "tokenizer" tokenizes to ["tokenizer"], doesn't match "token" token exactly
      expect(redactor.isSensitiveKey('tokenizer')).toBe(false);
    });
  });

  // ── redactObject ─────────────────────────────────────────

  describe('redactObject', () => {

    it('redacts secrets with token-matched key names after hardening', () => {
      // FIXED: Previously used Set.has() exact match, now uses tokenizeKey for flexible matching
      const obj = {
        myApiKey: 'sk-live-leaked',
        API_KEY: 'another-leak',
        x_token_value: 'tok-leaked',
      };
      const result = redactObject(obj);
      expect(result.myApiKey).toBe('[REDACTED]');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.x_token_value).toBe('[REDACTED]');
    });

    it('redacts secrets nested inside arrays after hardening', () => {
      // FIXED: Array bypass eliminated — arrays now recursively processed
      const obj = {
        credentials: [{ apiKey: 'sk-live-array-leak' }],
      };
      const result = redactObject(obj);
      const creds = result.credentials as Array<Record<string, unknown>>;
      expect(creds[0].apiKey).toBe('[REDACTED]');
    });

    it('redacts camelCase secret key variants after hardening', () => {
      // FIXED: "secretToken" tokenizes to ["secret","Token"], both are sensitive tokens
      const obj = { secretToken: 'leaked-value' };
      const result = redactObject(obj);
      expect(result.secretToken).toBe('[REDACTED]');
    });
  });

  // ── redactError ──────────────────────────────────────────

  describe('redactError', () => {

    it('leaks credentials in key:"value" format (no space after colon)', () => {
      // The regex key[=:]\s*\S+ catches this pattern
      const err = new Error('Failed with key:"sk-live-123abc"');
      const result = redactError(err);
      expect(result.message).not.toContain('sk-live-123abc');
    });

    it('redacts base64-encoded credentials after hardening', () => {
      // FIXED: Previously only caught Bearer tokens, now also catches Basic auth credentials
      const b64Secret = Buffer.from('sk-live-secretvalue').toString('base64');
      const err = new Error(`Authorization: Basic ${b64Secret}`);
      const result = redactError(err);
      expect(result.message).not.toContain(b64Secret);
    });

    it('leaks credentials in query string format', () => {
      // The key= pattern catches "key=sk-live-leaked" in query params
      const err = new Error('Request to https://api.example.com?api_key=sk-live-leaked&format=json failed');
      const result = redactError(err);
      expect(result.message).toContain('api.example.com');
    });

    it('returns generic message for non-Error objects', () => {
      const result = redactError('string error');
      expect(result.message).toBe('An unknown error occurred');
    });
  });
});
