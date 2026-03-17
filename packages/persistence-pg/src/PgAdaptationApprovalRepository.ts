import type { Pool } from 'pg';
import type { AdaptationApprovalRepository } from '@acds/adaptive-optimizer';
import type {
  AdaptationApproval,
  AdaptationApprovalStatus,
} from '@acds/adaptive-optimizer';

export class PgAdaptationApprovalRepository implements AdaptationApprovalRepository {
  constructor(private readonly pool: Pool) {}

  async save(approval: AdaptationApproval): Promise<void> {
    await this.pool.query(
      `INSERT INTO adaptation_approval_records (
         id, family_key, recommendation_id, status,
         submitted_at, decided_at, decided_by, reason, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         family_key = EXCLUDED.family_key,
         recommendation_id = EXCLUDED.recommendation_id,
         status = EXCLUDED.status,
         submitted_at = EXCLUDED.submitted_at,
         decided_at = EXCLUDED.decided_at,
         decided_by = EXCLUDED.decided_by,
         reason = EXCLUDED.reason,
         expires_at = EXCLUDED.expires_at`,
      [
        approval.id,
        approval.familyKey,
        approval.recommendationId,
        approval.status,
        approval.submittedAt,
        approval.decidedAt ?? null,
        approval.decidedBy ?? null,
        approval.reason ?? null,
        approval.expiresAt,
      ],
    );
  }

  async findById(id: string): Promise<AdaptationApproval | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM adaptation_approval_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findPending(): Promise<AdaptationApproval[]> {
    const result = await this.pool.query(
      `SELECT * FROM adaptation_approval_records
       WHERE status = 'pending'
       ORDER BY created_at ASC`,
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async findByFamily(familyKey: string): Promise<AdaptationApproval[]> {
    const result = await this.pool.query(
      `SELECT * FROM adaptation_approval_records
       WHERE family_key = $1
       ORDER BY created_at DESC`,
      [familyKey],
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async updateStatus(
    id: string,
    status: AdaptationApprovalStatus,
    fields?: { decidedAt?: string; decidedBy?: string; reason?: string },
  ): Promise<void> {
    const setClauses = ['status = $1'];
    const values: unknown[] = [status];
    let paramIdx = 2;

    if (fields?.decidedAt !== undefined) {
      setClauses.push(`decided_at = $${paramIdx++}`);
      values.push(fields.decidedAt);
    }
    if (fields?.decidedBy !== undefined) {
      setClauses.push(`decided_by = $${paramIdx++}`);
      values.push(fields.decidedBy);
    }
    if (fields?.reason !== undefined) {
      setClauses.push(`reason = $${paramIdx++}`);
      values.push(fields.reason);
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE adaptation_approval_records SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      values,
    );

    if (result.rowCount === 0) {
      throw new Error(`Adaptation approval not found: ${id}`);
    }
  }

  private mapRow(row: Record<string, unknown>): AdaptationApproval {
    return {
      id: row.id as string,
      familyKey: row.family_key as string,
      recommendationId: row.recommendation_id as string,
      status: row.status as AdaptationApprovalStatus,
      submittedAt: row.submitted_at as string,
      decidedAt: (row.decided_at as string) ?? undefined,
      decidedBy: (row.decided_by as string) ?? undefined,
      reason: (row.reason as string) ?? undefined,
      expiresAt: row.expires_at as string,
    };
  }
}
