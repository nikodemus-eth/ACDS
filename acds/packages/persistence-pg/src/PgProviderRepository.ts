import type { Pool } from 'pg';
import type { Provider } from '@acds/core-types';
import type { ProviderRepository } from '@acds/provider-broker';

export class PgProviderRepository implements ProviderRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Provider> {
    const result = await this.pool.query(
      `INSERT INTO providers (name, vendor, auth_type, base_url, enabled, environment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        provider.name,
        provider.vendor,
        provider.authType,
        provider.baseUrl,
        provider.enabled,
        provider.environment,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<Provider | null> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findAll(): Promise<Provider[]> {
    const result = await this.pool.query(
      'SELECT * FROM providers ORDER BY created_at DESC',
    );
    return result.rows.map(this.mapRow);
  }

  async findByVendor(vendor: string): Promise<Provider[]> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE vendor = $1 ORDER BY created_at DESC',
      [vendor],
    );
    return result.rows.map(this.mapRow);
  }

  async findEnabled(): Promise<Provider[]> {
    const result = await this.pool.query(
      'SELECT * FROM providers WHERE enabled = true ORDER BY created_at DESC',
    );
    return result.rows.map(this.mapRow);
  }

  async update(
    id: string,
    updates: Partial<Omit<Provider, 'id' | 'createdAt'>>,
  ): Promise<Provider> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      values.push(updates.name);
    }
    if (updates.vendor !== undefined) {
      setClauses.push(`vendor = $${paramIdx++}`);
      values.push(updates.vendor);
    }
    if (updates.authType !== undefined) {
      setClauses.push(`auth_type = $${paramIdx++}`);
      values.push(updates.authType);
    }
    if (updates.baseUrl !== undefined) {
      setClauses.push(`base_url = $${paramIdx++}`);
      values.push(updates.baseUrl);
    }
    if (updates.enabled !== undefined) {
      setClauses.push(`enabled = $${paramIdx++}`);
      values.push(updates.enabled);
    }
    if (updates.environment !== undefined) {
      setClauses.push(`environment = $${paramIdx++}`);
      values.push(updates.environment);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.pool.query(
      `UPDATE providers SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error(`Provider not found: ${id}`);
    }
    return this.mapRow(result.rows[0]);
  }

  async disable(id: string): Promise<Provider> {
    const result = await this.pool.query(
      `UPDATE providers SET enabled = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new Error(`Provider not found: ${id}`);
    }
    return this.mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query('DELETE FROM providers WHERE id = $1', [id]);
  }

  private mapRow(row: Record<string, unknown>): Provider {
    return {
      id: row.id as string,
      name: row.name as string,
      vendor: row.vendor as Provider['vendor'],
      authType: row.auth_type as Provider['authType'],
      baseUrl: row.base_url as string,
      enabled: row.enabled as boolean,
      environment: row.environment as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
