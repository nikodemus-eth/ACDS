import type { RoutingDecisionReadRepository } from '@acds/grits';
import type { RoutingDecision } from '@acds/core-types';
import type { Pool } from '@acds/persistence-pg';

export class PgRoutingDecisionReadRepository implements RoutingDecisionReadRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<RoutingDecision | undefined> {
    const result = await this.pool.query(
      `SELECT routing_decision, routing_decision_id, created_at
       FROM execution_records
       WHERE routing_decision_id = $1
          OR id = $1
          OR routing_decision ->> 'id' = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id],
    );
    return result.rows.length > 0 ? this.mapDecision(result.rows[0]) : undefined;
  }

  async findByExecutionId(executionId: string): Promise<RoutingDecision | undefined> {
    const result = await this.pool.query(
      `SELECT routing_decision, routing_decision_id, created_at
       FROM execution_records
       WHERE id = $1`,
      [executionId],
    );
    return result.rows.length > 0 ? this.mapDecision(result.rows[0]) : undefined;
  }

  private mapDecision(row: Record<string, unknown>): RoutingDecision | undefined {
    const decision = row.routing_decision;
    if (decision && typeof decision === 'object') {
      const parsed = decision as Record<string, unknown>;
      return {
        id: (parsed.id as string) ?? (row.routing_decision_id as string) ?? '',
        selectedModelProfileId: (parsed.selectedModelProfileId as string) ?? '',
        selectedTacticProfileId: (parsed.selectedTacticProfileId as string) ?? '',
        selectedProviderId: (parsed.selectedProviderId as string) ?? '',
        fallbackChain: Array.isArray(parsed.fallbackChain) ? parsed.fallbackChain as RoutingDecision['fallbackChain'] : [],
        rationaleId: (parsed.rationaleId as string) ?? '',
        rationaleSummary: (parsed.rationaleSummary as string) ?? '',
        resolvedAt: parsed.resolvedAt ? new Date(parsed.resolvedAt as string) : new Date(row.created_at as string),
      };
    }

    if (typeof decision === 'string' && decision.length > 0) {
      return this.mapDecision({
        ...row,
        routing_decision: JSON.parse(decision),
      });
    }

    return undefined;
  }
}
