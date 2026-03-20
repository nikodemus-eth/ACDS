import type { RoutingDecisionReadRepository } from '@acds/grits';
import type { RoutingDecision } from '@acds/core-types';
import type { Pool } from '@acds/persistence-pg';
import { getGritsPool } from './createGritsPool.js';

export class PgRoutingDecisionReadRepository implements RoutingDecisionReadRepository {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getGritsPool();
  }

  async findById(id: string): Promise<RoutingDecision | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM execution_records WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return undefined;
    return this.mapDecisionFromRow(result.rows[0]);
  }

  async findByExecutionId(executionId: string): Promise<RoutingDecision | undefined> {
    const result = await this.pool.query(
      `SELECT routing_decision FROM execution_records WHERE id = $1`,
      [executionId],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    const decision = row.routing_decision;
    if (!decision) return undefined;
    return typeof decision === 'string' ? JSON.parse(decision) : decision;
  }

  private mapDecisionFromRow(row: Record<string, unknown>): RoutingDecision {
    const decision = row.routing_decision;
    if (decision && typeof decision === 'object') {
      return decision as unknown as RoutingDecision;
    }
    if (typeof decision === 'string') {
      return JSON.parse(decision) as RoutingDecision;
    }
    return {
      id: row.routing_decision_id as string ?? row.id as string,
      selectedModelProfileId: row.selected_model_profile_id as string,
      selectedTacticProfileId: row.selected_tactic_profile_id as string,
      selectedProviderId: row.selected_provider_id as string,
      fallbackChain: [],
      rationaleId: '',
      rationaleSummary: '',
      resolvedAt: new Date(row.created_at as string),
    };
  }
}

const instance = new PgRoutingDecisionReadRepository();

export function getRoutingDecisionReadRepository(): PgRoutingDecisionReadRepository {
  return instance;
}
