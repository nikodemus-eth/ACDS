import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { buildExecutionPlan } from '../../../src/runtime/execution-planner.js';
import { SourceRegistry } from '../../../src/registry/registry.js';
import { PolicyTier } from '../../../src/domain/policy-tiers.js';
import { InvalidExecutionPlanError } from '../../../src/domain/errors.js';
import type { ProviderDefinition, CapabilityDefinition } from '../../../src/domain/source-types.js';
import type { MethodDefinition } from '../../../src/domain/method-registry.js';

const appleProvider: ProviderDefinition = {
  id: 'apple-intelligence-runtime',
  name: 'Apple',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'sovereign_runtime',
  executionMode: 'local',
};

const ollamaProvider: ProviderDefinition = {
  id: 'ollama-local',
  name: 'Ollama',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'self_hosted',
  executionMode: 'local',
};

const openaiCapability: CapabilityDefinition = {
  id: 'openai-api',
  name: 'OpenAI',
  sourceClass: 'capability',
  deterministic: false,
  explicitInvocationRequired: true,
  vendor: 'openai',
};

const summarizeMethod: MethodDefinition = {
  methodId: 'apple.foundation_models.summarize',
  providerId: 'apple-intelligence-runtime',
  subsystem: 'foundation_models',
  policyTier: PolicyTier.A,
  deterministic: true,
  requiresNetwork: false,
  inputSchema: z.any(),
  outputSchema: z.any(),
};

describe('Execution Planner', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(appleProvider, [summarizeMethod]);
    registry.registerProvider(ollamaProvider);
    registry.registerCapability(openaiCapability);
  });

  it('produces a local primary plan', () => {
    const plan = buildExecutionPlan(summarizeMethod, 'provider', registry);

    expect(plan.primary.providerId).toBe('apple-intelligence-runtime');
    expect(plan.primary.methodId).toBe('apple.foundation_models.summarize');
    expect(plan.primary.executionMode).toBe('local');
    expect(plan.executionClass).toBe('provider');
    expect(plan.fallback).toBeUndefined();
  });

  it('allows same-class fallback (provider → provider)', () => {
    const plan = buildExecutionPlan(summarizeMethod, 'provider', registry, {
      fallbackProviderId: 'ollama-local',
      fallbackMethodId: 'ollama.summarize',
    });

    expect(plan.fallback).toBeDefined();
    expect(plan.fallback!.providerId).toBe('ollama-local');
    expect(plan.fallback!.executionMode).toBe('local');
  });

  it('rejects cross-class fallback (provider → capability)', () => {
    expect(() =>
      buildExecutionPlan(summarizeMethod, 'provider', registry, {
        fallbackProviderId: 'openai-api',
        fallbackMethodId: 'openai.summarize',
      }),
    ).toThrow(InvalidExecutionPlanError);
  });

  it('capability plan is isolated — no fallback allowed', () => {
    const capMethod: MethodDefinition = {
      ...summarizeMethod,
      providerId: 'openai-api',
      methodId: 'capability.openai-api.summarization',
    };

    const plan = buildExecutionPlan(capMethod, 'capability', registry);
    expect(plan.executionClass).toBe('capability');
    expect(plan.fallback).toBeUndefined();
  });

  it('capability plan rejects fallback attempt', () => {
    const capMethod: MethodDefinition = {
      ...summarizeMethod,
      providerId: 'openai-api',
      methodId: 'capability.openai-api.summarization',
    };

    expect(() =>
      buildExecutionPlan(capMethod, 'capability', registry, {
        fallbackProviderId: 'apple-intelligence-runtime',
        fallbackMethodId: 'apple.foundation_models.summarize',
      }),
    ).toThrow(InvalidExecutionPlanError);
  });

  it('session plan uses session execution mode', () => {
    const sessionMethod: MethodDefinition = {
      ...summarizeMethod,
      providerId: 'openai-session' as any,
      methodId: 'session.openai.summarize',
    };

    // Need to register the session source
    registry.registerSession({
      id: 'openai-session',
      name: 'Session',
      sourceClass: 'session',
      explicitInvocationRequired: true,
      riskLevel: 'high',
      requiresRiskAcknowledgment: true,
      boundTo: 'openai-api',
    });

    const plan = buildExecutionPlan(sessionMethod, 'session', registry);
    expect(plan.primary.executionMode).toBe('session');
    expect(plan.executionClass).toBe('session');
  });
});
