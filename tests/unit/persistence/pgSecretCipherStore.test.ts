// ---------------------------------------------------------------------------
// Integration Tests – PgSecretCipherStore (PGlite, no mocks)
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PgSecretCipherStore } from '@acds/persistence-pg';
import type { EncryptedEnvelope } from '@acds/security';
import {
  createTestPool,
  runMigrations,
  truncateAll,
  closePool,
  type PoolLike,
} from '../../__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);

  // Migration 001 creates provider_secrets with a legacy schema (UUID FK, no envelope column).
  // Migration 008 uses IF NOT EXISTS so it's a no-op. Drop and recreate with the schema
  // that PgSecretCipherStore actually targets.
  await pool.execSQL(`
    DROP TABLE IF EXISTS provider_secrets CASCADE;
    CREATE TABLE provider_secrets (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id     VARCHAR     NOT NULL UNIQUE,
      envelope        JSONB       NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rotated_at      TIMESTAMPTZ,
      expires_at      TIMESTAMPTZ
    );
  `);
});
afterAll(async () => {
  await closePool();
});
beforeEach(async () => {
  await truncateAll(pool);
});

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
  let store: PgSecretCipherStore;

  beforeEach(() => {
    store = new PgSecretCipherStore(pool as any);
  });

  // ── store() ─────────────────────────────────────────────────────────────

  describe('store()', () => {
    it('returns a StoredSecret with correct fields', async () => {
      const result = await store.store('prov-openai', makeEnvelope());

      expect(result.providerId).toBe('prov-openai');
      expect(result.envelope).toEqual(makeEnvelope());
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.rotatedAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('store() + retrieve() round-trip', async () => {
      await store.store('prov-openai', makeEnvelope());

      const retrieved = await store.retrieve('prov-openai');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.providerId).toBe('prov-openai');
      expect(retrieved!.envelope).toEqual(makeEnvelope());
      expect(retrieved!.createdAt).toBeInstanceOf(Date);
    });

    it('store() twice for same providerId updates envelope (ON CONFLICT DO UPDATE)', async () => {
      await store.store('prov-openai', makeEnvelope('key-1'));
      await store.store('prov-openai', makeEnvelope('key-2'));

      const retrieved = await store.retrieve('prov-openai');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.envelope.keyId).toBe('key-2');

      // Confirm only one row exists
      const countResult = await pool.query(
        "SELECT count(*)::int AS cnt FROM provider_secrets WHERE provider_id = $1",
        ['prov-openai'],
      );
      expect(countResult.rows[0].cnt).toBe(1);
    });
  });

  // ── retrieve() ──────────────────────────────────────────────────────────

  describe('retrieve()', () => {
    it('returns null for nonexistent provider', async () => {
      const result = await store.retrieve('nonexistent');
      expect(result).toBeNull();
    });

    it('returns a StoredSecret with correctly parsed envelope', async () => {
      await store.store('prov-gemini', makeEnvelope('key-g'));

      const result = await store.retrieve('prov-gemini');
      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('prov-gemini');
      expect(result!.envelope.keyId).toBe('key-g');
      expect(result!.envelope.algorithm).toBe('aes-256-gcm');
    });
  });

  // ── rotate() ────────────────────────────────────────────────────────────

  describe('rotate()', () => {
    it('updates envelope and sets rotatedAt', async () => {
      await store.store('prov-openai', makeEnvelope('key-old'));

      const rotated = await store.rotate('prov-openai', makeEnvelope('key-new'));
      expect(rotated.providerId).toBe('prov-openai');
      expect(rotated.envelope.keyId).toBe('key-new');
      expect(rotated.rotatedAt).toBeInstanceOf(Date);

      // Verify via retrieve
      const retrieved = await store.retrieve('prov-openai');
      expect(retrieved!.envelope.keyId).toBe('key-new');
      expect(retrieved!.rotatedAt).toBeInstanceOf(Date);
    });

    it('falls back to store() when no existing row', async () => {
      const result = await store.rotate('prov-brand-new', makeEnvelope('key-fresh'));

      expect(result.providerId).toBe('prov-brand-new');
      expect(result.envelope.keyId).toBe('key-fresh');

      // Verify it actually persisted
      const retrieved = await store.retrieve('prov-brand-new');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.envelope.keyId).toBe('key-fresh');
    });
  });

  // ── revoke() ────────────────────────────────────────────────────────────

  describe('revoke()', () => {
    it('revoke() + retrieve() returns null', async () => {
      await store.store('prov-openai', makeEnvelope());
      await store.revoke('prov-openai');

      const result = await store.retrieve('prov-openai');
      expect(result).toBeNull();
    });
  });

  // ── exists() ────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('returns true when a secret exists', async () => {
      await store.store('prov-openai', makeEnvelope());

      const result = await store.exists('prov-openai');
      expect(result).toBe(true);
    });

    it('returns false when no secret exists', async () => {
      const result = await store.exists('nonexistent');
      expect(result).toBe(false);
    });
  });
});
