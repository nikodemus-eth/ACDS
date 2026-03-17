import type { Pool } from 'pg';
import type { ProviderHealth } from '@acds/core-types';
import type { ProviderHealthRepository } from '@acds/provider-broker';

export class PgProviderHealthRepository implements ProviderHealthRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(health: ProviderHealth): Promise<void> {
    await this.pool.query(
      `INSERT INTO provider_health (provider_id, status, last_test_at, last_success_at, last_failure_at, latency_ms, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider_id) DO UPDATE SET
         status = EXCLUDED.status,
         last_test_at = EXCLUDED.last_test_at,
         last_success_at = EXCLUDED.last_success_at,
         last_failure_at = EXCLUDED.last_failure_at,
         latency_ms = EXCLUDED.latency_ms,
         message = EXCLUDED.message`,
      [
        health.providerId,
        health.status,
        health.lastTestAt,
        health.lastSuccessAt,
        health.lastFailureAt,
        health.latencyMs,
        health.message,
      ],
    );
  }

  async findByProviderId(providerId: string): Promise<ProviderHealth | null> {
    const result = await this.pool.query(
      'SELECT * FROM provider_health WHERE provider_id = $1',
      [providerId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findAll(): Promise<ProviderHealth[]> {
    const result = await this.pool.query(
      'SELECT * FROM provider_health ORDER BY provider_id',
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async findByStatus(status: string): Promise<ProviderHealth[]> {
    const result = await this.pool.query(
      'SELECT * FROM provider_health WHERE status = $1 ORDER BY provider_id',
      [status],
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): ProviderHealth {
    return {
      providerId: row.provider_id as string,
      status: row.status as ProviderHealth['status'],
      lastTestAt: row.last_test_at ? new Date(row.last_test_at as string) : null,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at as string) : null,
      lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at as string) : null,
      latencyMs: row.latency_ms as number | null,
      message: row.message as string | null,
    };
  }
}
