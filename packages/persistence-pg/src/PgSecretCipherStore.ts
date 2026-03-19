import type { Pool } from 'pg';
import type { SecretCipherStore, StoredSecret } from '@acds/security';
import type { EncryptedEnvelope } from '@acds/security';
import { randomUUID } from 'node:crypto';

export class PgSecretCipherStore implements SecretCipherStore {
  constructor(private readonly pool: Pool) {}

  async store(providerId: string, envelope: EncryptedEnvelope): Promise<StoredSecret> {
    const id = randomUUID();
    const now = new Date();
    const result = await this.pool.query(
      `INSERT INTO provider_secrets (id, provider_id, envelope, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider_id) DO UPDATE SET envelope = $3, rotated_at = $4
       RETURNING *`,
      [id, providerId, JSON.stringify(envelope), now],
    );
    return this.mapRow(result.rows[0]);
  }

  async retrieve(providerId: string): Promise<StoredSecret | null> {
    const result = await this.pool.query(
      'SELECT * FROM provider_secrets WHERE provider_id = $1',
      [providerId],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async rotate(providerId: string, newEnvelope: EncryptedEnvelope): Promise<StoredSecret> {
    const now = new Date();
    const result = await this.pool.query(
      `UPDATE provider_secrets SET envelope = $1, rotated_at = $2
       WHERE provider_id = $3
       RETURNING *`,
      [JSON.stringify(newEnvelope), now, providerId],
    );
    if (result.rows.length === 0) {
      return this.store(providerId, newEnvelope);
    }
    return this.mapRow(result.rows[0]);
  }

  async revoke(providerId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM provider_secrets WHERE provider_id = $1',
      [providerId],
    );
  }

  async exists(providerId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM provider_secrets WHERE provider_id = $1',
      [providerId],
    );
    return result.rows.length > 0;
  }

  private mapRow(row: Record<string, unknown>): StoredSecret {
    const envelope = typeof row.envelope === 'string'
      ? JSON.parse(row.envelope)
      : row.envelope;
    return {
      id: row.id as string,
      providerId: row.provider_id as string,
      envelope: envelope as EncryptedEnvelope,
      createdAt: new Date(row.created_at as string),
      rotatedAt: row.rotated_at ? new Date(row.rotated_at as string) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    };
  }
}
