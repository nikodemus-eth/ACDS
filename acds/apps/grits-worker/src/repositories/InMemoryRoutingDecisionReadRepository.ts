import type { RoutingDecisionReadRepository } from '@acds/grits';
import type { RoutingDecision } from '@acds/core-types';
import { createPool } from '@acds/persistence-pg';

// ---------------------------------------------------------------------------
// InMemory implementation (used by tests)
// ---------------------------------------------------------------------------

export class InMemoryRoutingDecisionReadRepository implements RoutingDecisionReadRepository {
  private readonly decisions: RoutingDecision[] = [];
  private readonly executionMap = new Map<string, string>(); // executionId -> decisionId

  addDecision(decision: RoutingDecision, executionId?: string): void {
    this.decisions.push(decision);
    if (executionId) {
      this.executionMap.set(executionId, decision.id);
    }
  }

  async findById(id: string): Promise<RoutingDecision | undefined> {
    return this.decisions.find((d) => d.id === id);
  }

  async findByExecutionId(executionId: string): Promise<RoutingDecision | undefined> {
    const decisionId = this.executionMap.get(executionId);
    if (!decisionId) return undefined;
    return this.decisions.find((d) => d.id === decisionId);
  }
}

// ---------------------------------------------------------------------------
// Pg implementation (production)
// ---------------------------------------------------------------------------

function createWorkerPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
  return createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
}

const pool = createWorkerPool();

export class PgRoutingDecisionReadRepository implements RoutingDecisionReadRepository {
  async findById(id: string): Promise<RoutingDecision | undefined> {
    const result = await pool.query(
      'SELECT * FROM execution_records WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) return undefined;
    return this.mapDecisionFromRow(result.rows[0]);
  }

  async findByExecutionId(executionId: string): Promise<RoutingDecision | undefined> {
    const result = await pool.query(
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
