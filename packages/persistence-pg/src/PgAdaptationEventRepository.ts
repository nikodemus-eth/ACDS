import type { Pool } from 'pg';
import type {
  AdaptationEvent,
  AdaptationEventFilters,
} from '@acds/adaptive-optimizer';
import type { AdaptationRecommendation } from '@acds/adaptive-optimizer';

export type { AdaptationEvent, AdaptationEventFilters, AdaptationRecommendation };

export interface AdaptationEventReader {
  find(filters: AdaptationEventFilters): Promise<AdaptationEvent[]>;
}

export interface AdaptationRecommendationReader {
  listPending(): Promise<AdaptationRecommendation[]>;
}

export class PgAdaptationEventRepository implements AdaptationEventReader {
  constructor(private readonly pool: Pool) {}

  async find(filters: AdaptationEventFilters): Promise<AdaptationEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.trigger) {
      conditions.push(`mode = $${paramIndex++}`);
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
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): AdaptationEvent {
    return {
      id: row.id as string,
      familyKey: row.family_key as string,
      previousRanking: (row.previous_ranking ?? []) as AdaptationEvent['previousRanking'],
      newRanking: (row.new_ranking ?? []) as AdaptationEvent['newRanking'],
      trigger: (row.mode as AdaptationEvent['trigger']) ?? 'scheduled',
      evidenceSummary: (row.reason as string) ?? '',
      mode: (row.mode as AdaptationEvent['mode']) ?? 'recommend_only',
      policyBoundsSnapshot: { explorationRate: 0, mode: 'recommend_only' as const, additionalConstraints: {} },
      createdAt: (row.created_at as Date)?.toISOString?.() ?? (row.created_at as string),
    };
  }
}

export class PgAdaptationRecommendationRepository implements AdaptationRecommendationReader {
  constructor(private readonly pool: Pool) {}

  async listPending(): Promise<AdaptationRecommendation[]> {
    const result = await this.pool.query(
      `SELECT * FROM adaptation_approval_records WHERE status = 'pending' ORDER BY submitted_at DESC`,
    );
    return result.rows.map(this.mapRow);
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
