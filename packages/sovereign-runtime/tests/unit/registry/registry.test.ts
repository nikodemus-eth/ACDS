import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { SourceRegistry } from '../../../src/registry/registry.js';
import { PolicyTier } from '../../../src/domain/policy-tiers.js';
import { InvalidRegistrationError } from '../../../src/domain/errors.js';
import type { ProviderDefinition, CapabilityDefinition, SessionDefinition } from '../../../src/domain/source-types.js';
import type { MethodDefinition } from '../../../src/domain/method-registry.js';

const appleProvider: ProviderDefinition = {
  id: 'apple-intelligence-runtime',
  name: 'Apple Intelligence Sovereign Runtime',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'sovereign_runtime',
  executionMode: 'local',
};

const ollamaProvider: ProviderDefinition = {
  id: 'ollama-local',
  name: 'Ollama Local',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'self_hosted',
  executionMode: 'local',
};

const openaiCapability: CapabilityDefinition = {
  id: 'openai-api',
  name: 'OpenAI API',
  sourceClass: 'capability',
  deterministic: false,
  explicitInvocationRequired: true,
  vendor: 'openai',
};

const openaiSession: SessionDefinition = {
  id: 'openai-session',
  name: 'OpenAI User Session',
  sourceClass: 'session',
  explicitInvocationRequired: true,
  riskLevel: 'high',
  requiresRiskAcknowledgment: true,
  boundTo: 'openai-api',
};

function makeMethod(overrides: Partial<MethodDefinition> = {}): MethodDefinition {
  return {
    methodId: 'apple.foundation_models.summarize',
    providerId: 'apple-intelligence-runtime',
    subsystem: 'foundation_models',
    policyTier: PolicyTier.A,
    deterministic: true,
    requiresNetwork: false,
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.object({ summary: z.string() }),
    ...overrides,
  };
}

describe('SourceRegistry', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  describe('Provider Registration', () => {
    it('registers a valid provider', () => {
      registry.registerProvider(appleProvider);

      const source = registry.getSource('apple-intelligence-runtime');
      expect(source).toBeDefined();
      expect(source!.sourceClass).toBe('provider');
      expect((source as ProviderDefinition).deterministic).toBe(true);
    });

    it('registers a provider with methods', () => {
      const methods = [
        makeMethod(),
        makeMethod({
          methodId: 'apple.foundation_models.generate',
          subsystem: 'foundation_models',
        }),
      ];

      registry.registerProvider(appleProvider, methods);

      const m = registry.getMethod('apple.foundation_models.summarize');
      expect(m).toBeDefined();
      expect(m!.providerId).toBe('apple-intelligence-runtime');
      expect(m!.policyTier).toBe(PolicyTier.A);
    });

    it('retrieves all methods for a provider', () => {
      const methods = [
        makeMethod(),
        makeMethod({ methodId: 'apple.foundation_models.extract' }),
      ];
      registry.registerProvider(appleProvider, methods);

      const providerMethods = registry.getMethodsForProvider('apple-intelligence-runtime');
      expect(providerMethods).toHaveLength(2);
    });

    it('rejects duplicate method IDs', () => {
      const methods = [makeMethod()];
      registry.registerProvider(appleProvider, methods);

      expect(() =>
        registry.registerProvider(ollamaProvider, [
          makeMethod({ providerId: 'ollama-local' }),
        ]),
      ).toThrow(InvalidRegistrationError);
    });

    it('sets initial health state to healthy', () => {
      registry.registerProvider(appleProvider);
      expect(registry.getHealthState('apple-intelligence-runtime')).toBe('healthy');
    });
  });

  describe('Capability Registration', () => {
    it('registers a valid capability', () => {
      registry.registerCapability(openaiCapability);

      const source = registry.getSource('openai-api');
      expect(source).toBeDefined();
      expect(source!.sourceClass).toBe('capability');
      expect((source as CapabilityDefinition).deterministic).toBe(false);
      expect((source as CapabilityDefinition).explicitInvocationRequired).toBe(true);
    });

    it('capability has no methods', () => {
      registry.registerCapability(openaiCapability);
      const methods = registry.getMethodsForProvider('openai-api');
      expect(methods).toHaveLength(0);
    });
  });

  describe('Session Registration', () => {
    it('registers a valid session', () => {
      registry.registerSession(openaiSession);

      const source = registry.getSource('openai-session');
      expect(source).toBeDefined();
      expect(source!.sourceClass).toBe('session');
      expect((source as SessionDefinition).riskLevel).toBe('high');
      expect((source as SessionDefinition).requiresRiskAcknowledgment).toBe(true);
    });
  });

  describe('Invalid Mixed-Class Registration', () => {
    it('rejects a provider registered as a capability', () => {
      expect(() => registry.registerCapability(appleProvider as any)).toThrow(
        InvalidRegistrationError,
      );
    });

    it('rejects a capability registered as a provider', () => {
      expect(() => registry.registerProvider(openaiCapability as any)).toThrow(
        InvalidRegistrationError,
      );
    });

    it('rejects a session registered as a provider', () => {
      expect(() => registry.registerProvider(openaiSession as any)).toThrow(
        InvalidRegistrationError,
      );
    });

    it('rejects a local runtime registered as a session', () => {
      expect(() => registry.registerSession(appleProvider as any)).toThrow(
        InvalidRegistrationError,
      );
    });
  });

  describe('Method Binding Validation', () => {
    it('rejects method bound to wrong provider ID', () => {
      const badMethod = makeMethod({ providerId: 'wrong-provider' });
      expect(() => registry.registerProvider(appleProvider, [badMethod])).toThrow(
        InvalidRegistrationError,
      );
    });

    it('rejects method bound to a capability', () => {
      const method = makeMethod({ providerId: 'openai-api' });
      registry.registerCapability(openaiCapability);
      // Attempting to bind method to a capability should fail
      expect(() => registry.registerProvider(openaiCapability as any, [method])).toThrow(
        InvalidRegistrationError,
      );
    });

    it('each Apple method has correct metadata', () => {
      const methods: MethodDefinition[] = [
        makeMethod({
          methodId: 'apple.foundation_models.summarize',
          subsystem: 'foundation_models',
          policyTier: PolicyTier.A,
          deterministic: true,
          requiresNetwork: false,
        }),
        makeMethod({
          methodId: 'apple.writing_tools.rewrite',
          subsystem: 'writing_tools',
          policyTier: PolicyTier.B,
          deterministic: true,
          requiresNetwork: false,
        }),
        makeMethod({
          methodId: 'apple.image_creator.generate',
          subsystem: 'image_creator',
          policyTier: PolicyTier.C,
          deterministic: false,
          requiresNetwork: false,
        }),
      ];

      registry.registerProvider(appleProvider, methods);

      const summarize = registry.getMethod('apple.foundation_models.summarize');
      expect(summarize!.policyTier).toBe(PolicyTier.A);
      expect(summarize!.deterministic).toBe(true);
      expect(summarize!.requiresNetwork).toBe(false);
      expect(summarize!.subsystem).toBe('foundation_models');

      const rewrite = registry.getMethod('apple.writing_tools.rewrite');
      expect(rewrite!.policyTier).toBe(PolicyTier.B);

      const imageGen = registry.getMethod('apple.image_creator.generate');
      expect(imageGen!.policyTier).toBe(PolicyTier.C);
      expect(imageGen!.deterministic).toBe(false);
    });
  });

  describe('Lookup', () => {
    it('getSourcesByClass returns only matching class', () => {
      registry.registerProvider(appleProvider);
      registry.registerCapability(openaiCapability);
      registry.registerSession(openaiSession);

      const providers = registry.getSourcesByClass('provider');
      expect(providers).toHaveLength(1);
      expect(providers[0].sourceClass).toBe('provider');

      const capabilities = registry.getSourcesByClass('capability');
      expect(capabilities).toHaveLength(1);
      expect(capabilities[0].sourceClass).toBe('capability');

      const sessions = registry.getSourcesByClass('session');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sourceClass).toBe('session');
    });

    it('returns undefined for unknown source or method', () => {
      expect(registry.getSource('nonexistent')).toBeUndefined();
      expect(registry.getMethod('nonexistent.method')).toBeUndefined();
    });

    it('getAllMethods returns all registered methods', () => {
      const methods = [
        makeMethod({ methodId: 'apple.foundation_models.summarize' }),
        makeMethod({ methodId: 'apple.foundation_models.generate' }),
      ];
      registry.registerProvider(appleProvider, methods);

      expect(registry.getAllMethods()).toHaveLength(2);
    });
  });

  describe('Health State', () => {
    it('transitions through health states', () => {
      registry.registerProvider(appleProvider);

      registry.setHealthState('apple-intelligence-runtime', 'degraded');
      expect(registry.getHealthState('apple-intelligence-runtime')).toBe('degraded');

      registry.setHealthState('apple-intelligence-runtime', 'unavailable');
      expect(registry.getHealthState('apple-intelligence-runtime')).toBe('unavailable');

      registry.setHealthState('apple-intelligence-runtime', 'healthy');
      expect(registry.getHealthState('apple-intelligence-runtime')).toBe('healthy');
    });

    it('rejects health state for unknown source', () => {
      expect(() => registry.setHealthState('nonexistent', 'healthy')).toThrow(
        InvalidRegistrationError,
      );
    });
  });
});
