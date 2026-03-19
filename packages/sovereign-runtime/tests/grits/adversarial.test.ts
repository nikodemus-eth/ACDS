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
import { RuntimeOrchestrator } from '../../src/runtime/runtime-orchestrator.js';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { redactLogEvent } from '../../src/telemetry/redaction.js';
import {
  InvalidRegistrationError,
  InvalidExecutionPlanError,
  ProviderUnavailableError,
} from '../../src/domain/errors.js';
import { PolicyTier } from '../../src/domain/policy-tiers.js';
import type { ACDSMethodRequest } from '../../src/domain/execution-request.js';
import type { ProviderRuntime } from '../../src/providers/provider-runtime.js';
import { z } from 'zod';

describe('GRITS Adversarial', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  });

  it('GRITS-ADV-001: normal provider request stays as provider execution class (no escalation)', () => {
    // Register a capability so it exists in the registry
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);

    const method = APPLE_METHODS.find(
      (m) => m.methodId === 'apple.foundation_models.summarize',
    )!;

    // Normal provider request — no useCapability set
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: { text: 'test' },
      // No useCapability — this is a plain provider request
    };

    const decision = evaluatePolicy(request, method, registry, false);
    // Should stay as provider, not escalate to capability
    expect(decision.allowed).toBe(true);
    expect(decision.executionClass).toBe('provider');
  });

  it('GRITS-ADV-002: cross-class fallback via malformed execution plan rejected', () => {
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);

    const method = APPLE_METHODS.find(
      (m) => m.methodId === 'apple.foundation_models.summarize',
    )!;

    // Attempt to build a plan with provider primary + capability fallback
    expect(() => {
      buildExecutionPlan(method, 'provider', registry, {
        fallbackProviderId: FIXTURES_OPENAI_CAPABILITY.id,
        fallbackMethodId: 'openai.gpt.summarize',
      });
    }).toThrow(InvalidExecutionPlanError);
  });

  it('GRITS-ADV-003: Tier D method under local-only policy is blocked', () => {
    const tierDMethod = {
      methodId: 'apple.cloud.augmented',
      providerId: 'apple-intelligence-runtime',
      subsystem: 'foundation_models' as const,
      policyTier: PolicyTier.D,
      deterministic: false,
      requiresNetwork: true,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    const request: ACDSMethodRequest = {
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.cloud.augmented',
      input: {},
      constraints: { localOnly: true },
    };

    const decision = evaluatePolicy(request, tierDMethod, registry, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Tier D');
  });

  it('GRITS-ADV-004: attempt to register session as provider', () => {
    expect(() => {
      registry.registerProvider(FIXTURES_OPENAI_SESSION as any);
    }).toThrow(InvalidRegistrationError);
  });

  it('GRITS-ADV-005: log poisoning with token-like strings is redacted', () => {
    const event = {
      executionId: 'exec-poison-001',
      sourceType: 'provider' as const,
      sourceId: 'apple-intelligence-runtime',
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local' as const,
      latencyMs: 10,
      status: 'success' as const,
      notes: 'User token was sk-abc1234567890abcdefghij used here',
      apiKey: 'sk-secret-key-that-should-never-appear-in-logs',
      timestamp: new Date().toISOString(),
    };

    const redacted = redactLogEvent(event);

    // The apiKey field should be fully redacted (sensitive field name)
    expect(redacted.apiKey).toBe('[REDACTED]');

    // The token pattern in the notes string should also be redacted
    expect((redacted.notes as string)).not.toContain('sk-abc1234567890abcdefghij');
    expect((redacted.notes as string)).toContain('[REDACTED]');
  });

  it('GRITS-ADV-006: bypass explicit risk acknowledgment for session is blocked', () => {
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);
    registry.registerSession(FIXTURES_OPENAI_SESSION);

    const method = APPLE_METHODS[0];
    const request: ACDSMethodRequest = {
      providerId: method.providerId,
      methodId: method.methodId,
      input: { text: 'test' },
      useSession: FIXTURES_OPENAI_SESSION.id,
      riskAcknowledged: false,
    };

    const decision = evaluatePolicy(request, method, registry, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('risk acknowledgment');
  });

  it('GRITS-ADV-007: provider failure does not coerce capability escalation', async () => {
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);

    // Create Apple adapter and make it unavailable
    const appleAdapter = new AppleRuntimeAdapter();
    appleAdapter.setAvailable(false);

    const runtimes = new Map<string, ProviderRuntime>();
    runtimes.set(FIXTURES_APPLE_PROVIDER.id, appleAdapter);

    const orchestrator = new RuntimeOrchestrator({
      registry,
      runtimes,
    });

    // Execute without useCapability set — should get ProviderUnavailableError,
    // NOT a silent escalation to capability
    await expect(
      orchestrator.executeTask('summarize this text', {
        input: { text: 'test document' },
        // No useCapability — capability must NOT be auto-selected
      }),
    ).rejects.toThrow(ProviderUnavailableError);
  });
});
