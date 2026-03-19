import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { evaluatePolicy, validateFallbackClass } from '../../../src/runtime/policy-engine.js';
import { SourceRegistry } from '../../../src/registry/registry.js';
import { PolicyTier } from '../../../src/domain/policy-tiers.js';
import type { ACDSMethodRequest } from '../../../src/domain/execution-request.js';
import type { MethodDefinition } from '../../../src/domain/method-registry.js';
import type { ProviderDefinition, CapabilityDefinition, SessionDefinition } from '../../../src/domain/source-types.js';

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

const openaiSession: SessionDefinition = {
  id: 'openai-session',
  name: 'OpenAI Session',
  sourceClass: 'session',
  explicitInvocationRequired: true,
  riskLevel: 'high',
  requiresRiskAcknowledgment: true,
  boundTo: 'openai-api',
};

const tierAMethod: MethodDefinition = {
  methodId: 'apple.foundation_models.summarize',
  providerId: 'apple-intelligence-runtime',
  subsystem: 'foundation_models',
  policyTier: PolicyTier.A,
  deterministic: true,
  requiresNetwork: false,
  inputSchema: z.any(),
  outputSchema: z.any(),
};

const tierDMethod: MethodDefinition = {
  methodId: 'apple.cloud.augmented_search',
  providerId: 'apple-intelligence-runtime',
  subsystem: 'foundation_models',
  policyTier: PolicyTier.D,
  deterministic: false,
  requiresNetwork: true,
  inputSchema: z.any(),
  outputSchema: z.any(),
};

function makeRequest(overrides: Partial<ACDSMethodRequest> = {}): ACDSMethodRequest {
  return {
    providerId: 'apple-intelligence-runtime',
    methodId: 'apple.foundation_models.summarize',
    input: { text: 'hello' },
    ...overrides,
  };
}

describe('Policy Engine', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
    registry.registerProvider(appleProvider, [tierAMethod, tierDMethod]);
    registry.registerProvider(ollamaProvider);
    registry.registerCapability(openaiCapability);
    registry.registerSession(openaiSession);
  });

  describe('Provider path', () => {
    it('allows local provider execution by default', () => {
      const decision = evaluatePolicy(makeRequest(), tierAMethod, registry, false);
      expect(decision.allowed).toBe(true);
      expect(decision.executionClass).toBe('provider');
    });

    it('allows provider execution with local_only constraint', () => {
      const decision = evaluatePolicy(
        makeRequest({ constraints: { localOnly: true } }),
        tierAMethod,
        registry,
        false,
      );
      expect(decision.allowed).toBe(true);
    });
  });

  describe('Capability blocking', () => {
    it('allows capability when explicitly requested', () => {
      const decision = evaluatePolicy(
        makeRequest({ useCapability: 'openai-api' }),
        tierAMethod,
        registry,
        true,
      );
      expect(decision.allowed).toBe(true);
      expect(decision.executionClass).toBe('capability');
    });

    it('blocks capability under local_only constraint', () => {
      const decision = evaluatePolicy(
        makeRequest({ useCapability: 'openai-api', constraints: { localOnly: true } }),
        tierAMethod,
        registry,
        true,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('local_only');
    });

    it('blocks unknown capability', () => {
      const decision = evaluatePolicy(
        makeRequest({ useCapability: 'nonexistent' }),
        tierAMethod,
        registry,
        true,
      );
      expect(decision.allowed).toBe(false);
    });
  });

  describe('Session blocking', () => {
    it('blocks session without risk acknowledgment', () => {
      const decision = evaluatePolicy(
        makeRequest({ useSession: 'openai-session' }),
        tierAMethod,
        registry,
        false,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('risk acknowledgment');
    });

    it('allows session with risk acknowledgment', () => {
      const decision = evaluatePolicy(
        makeRequest({ useSession: 'openai-session', riskAcknowledged: true }),
        tierAMethod,
        registry,
        false,
      );
      expect(decision.allowed).toBe(true);
      expect(decision.executionClass).toBe('session');
    });

    it('blocks session under local_only constraint even with risk ack', () => {
      const decision = evaluatePolicy(
        makeRequest({
          useSession: 'openai-session',
          riskAcknowledged: true,
          constraints: { localOnly: true },
        }),
        tierAMethod,
        registry,
        false,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('local_only');
    });
  });

  describe('Tier D blocking', () => {
    it('blocks Tier D method under local_only constraint', () => {
      const decision = evaluatePolicy(
        makeRequest({ constraints: { localOnly: true } }),
        tierDMethod,
        registry,
        false,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Tier D');
    });

    it('blocks method requiring network under local_only', () => {
      const networkMethod: MethodDefinition = {
        ...tierAMethod,
        requiresNetwork: true,
      };
      const decision = evaluatePolicy(
        makeRequest({ constraints: { localOnly: true } }),
        networkMethod,
        registry,
        false,
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('network');
    });
  });

  describe('Fallback class validation', () => {
    it('allows same-class fallback (provider → provider)', () => {
      const decision = validateFallbackClass('provider', 'ollama-local', registry);
      expect(decision.allowed).toBe(true);
    });

    it('blocks cross-class fallback (provider → capability)', () => {
      const decision = validateFallbackClass('provider', 'openai-api', registry);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Cross-class');
    });

    it('blocks cross-class fallback (provider → session)', () => {
      const decision = validateFallbackClass('provider', 'openai-session', registry);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Cross-class');
    });

    it('blocks fallback to unknown source', () => {
      const decision = validateFallbackClass('provider', 'nonexistent', registry);
      expect(decision.allowed).toBe(false);
    });
  });
});
