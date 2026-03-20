import type { Pool } from 'pg';
import type {
  AdaptationEvent,
  AdaptationEventFilters,
  AdaptationLedgerWriter,
} from '@acds/adaptive-optimizer';
import type { AdaptationRecommendation } from '@acds/adaptive-optimizer';

export type { AdaptationEvent, AdaptationEventFilters, AdaptationRecommendation };

export interface AdaptationEventReader {
  find(filters: AdaptationEventFilters): Promise<AdaptationEvent[]>;
}

export interface AdaptationRecommendationReader {
  listPending(): Promise<AdaptationRecommendation[]>;
}

export class PgAdaptationEventRepository implements AdaptationEventReader, AdaptationLedgerWriter {
  constructor(private readonly pool: Pool) {}

  async writeEvent(event: AdaptationEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO auto_apply_decision_records
        (id, family_key, previous_ranking, new_ranking, reason, mode, risk_basis, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.familyKey,
        JSON.stringify(event.previousRanking),
        JSON.stringify(event.newRanking),
        event.evidenceSummary,
        event.mode,
        event.trigger,
        event.createdAt,
      ],
    );
  }

  async listEvents(familyKey: string, filters?: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    const conditions: string[] = ['family_key = $1'];
    const params: unknown[] = [familyKey];
    let paramIndex = 2;

    if (filters?.trigger) {
      conditions.push(`risk_basis = $${paramIndex++}`);
      params.push(filters.trigger);
    }
    if (filters?.since) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.since);
    }
    if (filters?.until) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.until);
    }

    const limit = filters?.limit ?? 100;
    const query = `SELECT * FROM auto_apply_decision_records WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows.map((r) => this.mapRow(r));
  }

  async getEvent(id: string): Promise<AdaptationEvent | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM auto_apply_decision_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async find(filters: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.trigger) {
      conditions.push(`risk_basis = $${paramIndex++}`);
      params.push(filters.trigger);
    }

    if (filters.since) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.since);
    }

    if (filters.until) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.until);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = filters.limit ?? 100;

    const query = `SELECT * FROM auto_apply_decision_records ${where} ORDER BY created_at DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): AdaptationEvent {
    return {
      id: row.id as string,
      familyKey: row.family_key as string,
      previousRanking: (row.previous_ranking ?? []) as AdaptationEvent['previousRanking'],
      newRanking: (row.new_ranking ?? []) as AdaptationEvent['newRanking'],
      trigger: (row.risk_basis as AdaptationEvent['trigger']) ?? 'scheduled',
      evidenceSummary: (row.reason as string) ?? '',
      mode: (row.mode as AdaptationEvent['mode']) ?? 'recommend_only',
      policyBoundsSnapshot: { explorationRate: 0, mode: 'recommend_only' as const, additionalConstraints: {} },
      createdAt: (row.applied_at as Date)?.toISOString?.() ?? (row.applied_at as string),
    };
  }
}

export class PgAdaptationRecommendationRepository implements AdaptationRecommendationReader {
  constructor(private readonly pool: Pool) {}

  async listPending(): Promise<AdaptationRecommendation[]> {
    const result = await this.pool.query(
      `SELECT * FROM adaptation_approval_records WHERE status = 'pending' ORDER BY submitted_at DESC`,
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): AdaptationRecommendation {
    return {
      id: row.recommendation_id as string,
      familyKey: row.family_key as string,
      recommendedRanking: [],
      evidence: (row.reason as string) ?? '',
      status: (row.status as AdaptationRecommendation['status']) ?? 'pending',
      createdAt: row.submitted_at as string,
    };
  }
}
