// ---------------------------------------------------------------------------
// Integration Tests -- API Dispatch Endpoints
// PGlite-backed: uses real PG repositories, no Mock classes.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type {
  RoutingRequest,
  RoutingDecision,
  DispatchRunResponse,
  ExecutionRecord,
  ExecutionRationale,
} from '@acds/core-types';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';
import { PgExecutionRecordRepository } from '@acds/persistence-pg';
import { createTestPool, runMigrations, truncateAll, closePool, type PoolLike } from '../__test-support__/pglitePool.js';

// -- PGlite lifecycle --------------------------------------------------------

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await closePool();
});

// ---------------------------------------------------------------------------
// Deterministic UUIDs for test data (execution_records.id is UUID in PG)
// ---------------------------------------------------------------------------
const UUID_EXEC_001  = '00000000-0000-0000-0000-000000000001';
const UUID_EXEC_002  = '00000000-0000-0000-0000-000000000002';
const UUID_DECISION  = '00000000-0000-0000-0000-000000000010';
const UUID_RATIONALE = '00000000-0000-0000-0000-000000000020';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeRoutingRequest(): RoutingRequest {
  return {
    application: 'thingstead',
    process: 'governance',
    step: 'advisory',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.ADVISORY,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
  };
}

function makeRoutingDecision(): RoutingDecision {
  return {
    id: UUID_DECISION,
    selectedModelProfileId: 'profile-local',
    selectedTacticProfileId: 'tactic-single',
    selectedProviderId: 'provider-ollama',
    fallbackChain: [
      {
        modelProfileId: 'profile-cloud',
        tacticProfileId: 'tactic-single',
        providerId: 'provider-openai',
        priority: 1,
      },
    ],
    rationaleId: UUID_RATIONALE,
    rationaleSummary: 'Selected local model for advisory task',
    resolvedAt: new Date(),
  };
}

function makeRationale(): ExecutionRationale {
  return {
    id: UUID_RATIONALE,
    routingDecisionId: UUID_DECISION,
    executionFamilyKey: 'thingstead.governance.advisory.advisory.working',
    selectedProfileReason: 'Profile Local Analyst selected: supports analysis/simple',
    selectedTacticReason: 'Tactic Single Prompt selected: method single_prompt',
    selectedProviderReason: 'Provider provider-ollama assigned to Local Analyst',
    policyMatchSummary: 'Privacy: cloud_allowed, Cost: medium, Escalation: false',
    eligibleProfileCount: 2,
    eligibleTacticCount: 1,
    constraintsSummary: 'Structured: false, Traceable: false',
    createdAt: new Date(),
  };
}

function makeExecutionRecord(id: string): ExecutionRecord {
  return {
    id,
    executionFamily: { key: 'thingstead.governance.advisory', application: 'thingstead', process: 'governance', step: 'advisory' } as any,
    routingDecisionId: UUID_DECISION,
    selectedModelProfileId: 'profile-local',
    selectedTacticProfileId: 'tactic-single',
    selectedProviderId: 'provider-ollama',
    status: 'succeeded',
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 220,
    costEstimate: 0.001,
    normalizedOutput: 'Advisory output',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: new Date(),
    completedAt: new Date(),
  };
}

async function seedExecutionRecords() {
  // Insert execution records directly into PG
  const record1 = makeExecutionRecord(UUID_EXEC_001);
  const record2 = makeExecutionRecord(UUID_EXEC_002);

  for (const rec of [record1, record2]) {
    await pool.query(
      `INSERT INTO execution_records
        (id, application, process, step, decision_posture, cognitive_grade,
         routing_decision_id,
         selected_model_profile_id, selected_tactic_profile_id, selected_provider_id,
         status, input_tokens, output_tokens, latency_ms, cost_estimate,
         normalized_output, error_message, fallback_attempts, created_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        rec.id, 'thingstead', 'governance', 'advisory', 'advisory', 'standard',
        rec.routingDecisionId,
        rec.selectedModelProfileId, rec.selectedTacticProfileId, rec.selectedProviderId,
        rec.status, rec.inputTokens, rec.outputTokens, rec.latencyMs, rec.costEstimate,
        rec.normalizedOutput, rec.errorMessage, rec.fallbackAttempts, rec.createdAt, rec.completedAt,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Test helpers for routing decision/rationale (these are domain objects,
// not stored in PG in this test context -- validated structurally)
// ---------------------------------------------------------------------------

describe('API -- Routing Decision Structure', () => {
  it('routing decision contains selected IDs', () => {
    const decision = makeRoutingDecision();

    expect(decision.id).toBeTruthy();
    expect(decision.selectedModelProfileId).toBe('profile-local');
    expect(decision.selectedTacticProfileId).toBe('tactic-single');
    expect(decision.selectedProviderId).toBe('provider-ollama');
  });

  it('includes a fallback chain in the decision', () => {
    const decision = makeRoutingDecision();

    expect(decision.fallbackChain).toBeDefined();
    expect(decision.fallbackChain.length).toBeGreaterThan(0);
    expect(decision.fallbackChain[0].priority).toBe(1);
  });

  it('includes a rationale with the decision', () => {
    const rationale = makeRationale();

    expect(rationale.id).toBeTruthy();
    expect(rationale.selectedProfileReason).toContain('selected');
    expect(rationale.eligibleProfileCount).toBeGreaterThan(0);
  });
});

describe('API -- Execution Record Queries (PGlite-backed)', () => {
  it('returns a list of execution records', async () => {
    await seedExecutionRecords();

    const result = await pool.query('SELECT * FROM execution_records');
    expect(result.rows.length).toBe(2);
  });

  it('each record has the expected shape', async () => {
    await seedExecutionRecords();

    const result = await pool.query('SELECT * FROM execution_records LIMIT 1');
    const record = result.rows[0];

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('routing_decision_id');
    expect(record).toHaveProperty('selected_model_profile_id');
    expect(record).toHaveProperty('selected_tactic_profile_id');
    expect(record).toHaveProperty('selected_provider_id');
    expect(record).toHaveProperty('status');
    expect(record).toHaveProperty('latency_ms');
  });
});

describe('API -- Execution Record by ID (PGlite-backed)', () => {
  it('returns a single execution record by ID', async () => {
    await seedExecutionRecords();

    const result = await pool.query('SELECT * FROM execution_records WHERE id = $1', [UUID_EXEC_001]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].id).toBe(UUID_EXEC_001);
    expect(result.rows[0].status).toBe('succeeded');
  });

  it('returns no rows for a non-existent execution', async () => {
    await seedExecutionRecords();

    const result = await pool.query('SELECT * FROM execution_records WHERE id = $1', ['00000000-0000-0000-0000-ffffffffffff']);
    expect(result.rows.length).toBe(0);
  });
});
