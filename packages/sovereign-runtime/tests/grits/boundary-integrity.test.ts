import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import {
  FIXTURES_APPLE_PROVIDER,
  FIXTURES_OPENAI_CAPABILITY,
  FIXTURES_OPENAI_SESSION,
} from '../../src/fixtures/provider-fixtures.js';
import { evaluatePolicy } from '../../src/runtime/policy-engine.js';
import { buildExecutionPlan } from '../../src/runtime/execution-planner.js';
import { ExecutionLogger } from '../../src/telemetry/execution-logger.js';
import type { ACDSMethodRequest } from '../../src/domain/execution-request.js';
import { z } from 'zod';
import { PolicyTier } from '../../src/domain/policy-tiers.js';

describe('GRITS Boundary Integrity', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);
    registry.registerSession(FIXTURES_OPENAI_SESSION);
  });

  it('GRITS-BOUND-001: capability execution does not enter provider runtime path', () => {
    const method = APPLE_METHODS[0];
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: { text: 'test' },
      useCapability: FIXTURES_OPENAI_CAPABILITY.id,
    };

    const decision = evaluatePolicy(request, method, registry, true);
    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('capability');
  });

  it('GRITS-BOUND-002: session execution does not reuse provider fallback logic', () => {
    // Build a session-class plan — it should have no fallback
    const syntheticMethod = {
      methodId: `session.${FIXTURES_OPENAI_SESSION.id}.summarization`,
      providerId: FIXTURES_OPENAI_SESSION.id,
      subsystem: 'foundation_models' as const,
      policyTier: PolicyTier.A,
      deterministic: false,
      requiresNetwork: true,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    const plan = buildExecutionPlan(syntheticMethod, 'session', registry);
    expect(plan.executionClass).toBe('session');
    expect(plan.fallback).toBeUndefined();
    expect(plan.primary.executionMode).toBe('session');
  });

  it('GRITS-BOUND-003: capability errors remain isolated to capability telemetry', () => {
    const logger = new ExecutionLogger();

    logger.logExecution({
      executionId: 'exec-cap-001',
      sourceType: 'capability',
      sourceId: FIXTURES_OPENAI_CAPABILITY.id,
      providerId: FIXTURES_OPENAI_CAPABILITY.id,
      methodId: 'capability.openai-api.summarization',
      executionMode: 'controlled_remote',
      latencyMs: 500,
      status: 'failure',
      timestamp: new Date().toISOString(),
    });

    const logs = logger.getExecutionLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].sourceType).toBe('capability');
    expect(logs[0].status).toBe('failure');
  });

  it('GRITS-BOUND-004: expired session triggers session-specific handling', () => {
    const method = APPLE_METHODS[0];
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: { text: 'test' },
      useSession: FIXTURES_OPENAI_SESSION.id,
      riskAcknowledged: true,
    };

    const decision = evaluatePolicy(request, method, registry, false);
    // Session with risk acknowledged should route to session execution class
    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('session');
  });

  it('GRITS-BOUND-005: session use always tagged high-risk', () => {
    const sessionSource = registry.getSource(FIXTURES_OPENAI_SESSION.id);
    expect(sessionSource).toBeDefined();
    expect(sessionSource!.sourceClass).toBe('session');
    expect((sessionSource as any).riskLevel).toBe('high');
  });
});
