// ---------------------------------------------------------------------------
// Unit Tests – PgSecretCipherStore
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PgSecretCipherStore } from '@acds/persistence-pg';
import type { EncryptedEnvelope } from '@acds/security';

// ── Mock pool ──────────────────────────────────────────────────────────────

function createMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
}

function makeEnvelope(keyId = 'key-1'): EncryptedEnvelope {
  return {
    ciphertext: 'ct-abc',
    iv: 'iv-123',
    authTag: 'tag-456',
    keyId,
    algorithm: 'aes-256-gcm',
  };
}

describe('PgSecretCipherStore', () => {
  let pool: ReturnType<typeof createMockPool>;
  let store: PgSecretCipherStore;

  beforeEach(() => {
    pool = createMockPool();
    store = new PgSecretCipherStore(pool as any);
  });

  // ── store() ─────────────────────────────────────────────────────────────

  describe('store()', () => {
    it('inserts a secret and returns a StoredSecret record', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await store.store('prov-openai', makeEnvelope());

      expect(result.providerId).toBe('prov-openai');
      expect(result.envelope).toEqual(makeEnvelope());
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.rotatedAt).toBeNull();
      expect(result.expiresAt).toBeNull();

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('INSERT INTO provider_secrets');
      expect(call[1][1]).toBe('prov-openai');
    });

    it('passes envelope as JSON string', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await store.store('prov-gemini', makeEnvelope('key-2'));

      const call = pool.query.mock.calls[0];
      const envelopeParam = call[1][2];
      expect(JSON.parse(envelopeParam)).toEqual(makeEnvelope('key-2'));
    });
  });

  // ── retrieve() ──────────────────────────────────────────────────────────

  describe('retrieve()', () => {
    it('returns null when no row found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await store.retrieve('nonexistent');
      expect(result).toBeNull();
    });

    it('returns a StoredSecret when row exists', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sec-1',
          provider_id: 'prov-openai',
          envelope: JSON.stringify(makeEnvelope()),
          created_at: '2026-03-16T10:00:00.000Z',
          rotated_at: null,
          expires_at: null,
        }],
      });

      const result = await store.retrieve('prov-openai');
      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('prov-openai');
      expect(result!.envelope).toEqual(makeEnvelope());
      expect(result!.createdAt).toBeInstanceOf(Date);
    });

    it('handles envelope as parsed object (JSONB auto-parse)', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sec-2',
          provider_id: 'prov-gemini',
          envelope: makeEnvelope('key-2'),
          created_at: '2026-03-16T10:00:00.000Z',
          rotated_at: '2026-03-16T11:00:00.000Z',
          expires_at: null,
        }],
      });

      const result = await store.retrieve('prov-gemini');
      expect(result!.rotatedAt).toBeInstanceOf(Date);
      expect(result!.envelope.keyId).toBe('key-2');
    });
  });

  // ── rotate() ────────────────────────────────────────────────────────────

  describe('rotate()', () => {
    it('updates existing secret and returns updated record', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'sec-1',
          provider_id: 'prov-openai',
          envelope: JSON.stringify(makeEnvelope('key-new')),
          created_at: '2026-03-15T10:00:00.000Z',
          rotated_at: '2026-03-16T12:00:00.000Z',
          expires_at: null,
        }],
      });

      const result = await store.rotate('prov-openai', makeEnvelope('key-new'));
      expect(result.providerId).toBe('prov-openai');
      expect(result.envelope.keyId).toBe('key-new');

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('UPDATE provider_secrets');
    });

    it('falls back to store() when no existing row', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE returns nothing
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

      const result = await store.rotate('prov-new', makeEnvelope());
      expect(result.providerId).toBe('prov-new');
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });

  // ── revoke() ────────────────────────────────────────────────────────────

  describe('revoke()', () => {
    it('deletes the secret for the given provider', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await store.revoke('prov-openai');

      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('DELETE FROM provider_secrets');
      expect(call[1]).toEqual(['prov-openai']);
    });
  });

  // ── exists() ────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('returns true when a row exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const result = await store.exists('prov-openai');
      expect(result).toBe(true);
    });

    it('returns false when no row exists', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const result = await store.exists('nonexistent');
      expect(result).toBe(false);
    });
  });
});
