import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateSourceDefinition,
  validateMethodBinding,
  rejectMixedClassRegistration,
} from '../../../src/registry/registry-validation.js';
import { InvalidRegistrationError } from '../../../src/domain/errors.js';
import { PolicyTier } from '../../../src/domain/policy-tiers.js';
import type { ProviderDefinition, CapabilityDefinition, SessionDefinition } from '../../../src/domain/source-types.js';
import type { MethodDefinition } from '../../../src/domain/method-registry.js';

describe('Registry Validation', () => {
  describe('validateSourceDefinition', () => {
    it('accepts a valid provider', () => {
      const provider: ProviderDefinition = {
        id: 'apple-intelligence-runtime',
        name: 'Apple',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      expect(() => validateSourceDefinition(provider)).not.toThrow();
    });

    it('rejects provider with empty ID', () => {
      const provider: ProviderDefinition = {
        id: '',
        name: 'Apple',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      expect(() => validateSourceDefinition(provider)).toThrow(InvalidRegistrationError);
    });

    it('rejects provider with empty name', () => {
      const provider: ProviderDefinition = {
        id: 'test',
        name: '',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      expect(() => validateSourceDefinition(provider)).toThrow(InvalidRegistrationError);
    });

    it('accepts a valid capability', () => {
      const cap: CapabilityDefinition = {
        id: 'openai-api',
        name: 'OpenAI',
        sourceClass: 'capability',
        deterministic: false,
        explicitInvocationRequired: true,
        vendor: 'openai',
      };
      expect(() => validateSourceDefinition(cap)).not.toThrow();
    });

    it('rejects capability with deterministic=true', () => {
      const cap = {
        id: 'bad',
        name: 'Bad',
        sourceClass: 'capability' as const,
        deterministic: true,
        explicitInvocationRequired: true,
        vendor: 'bad',
      };
      expect(() => validateSourceDefinition(cap as any)).toThrow(InvalidRegistrationError);
    });

    it('accepts a valid session', () => {
      const session: SessionDefinition = {
        id: 'session-1',
        name: 'Session',
        sourceClass: 'session',
        explicitInvocationRequired: true,
        riskLevel: 'high',
        requiresRiskAcknowledgment: true,
        boundTo: 'openai-api',
      };
      expect(() => validateSourceDefinition(session)).not.toThrow();
    });

    it('rejects session without risk level', () => {
      const session = {
        id: 'session-bad',
        name: 'Bad Session',
        sourceClass: 'session' as const,
        explicitInvocationRequired: true,
        riskLevel: undefined,
        requiresRiskAcknowledgment: true,
        boundTo: 'openai-api',
      };
      expect(() => validateSourceDefinition(session as any)).toThrow(InvalidRegistrationError);
    });
  });

  describe('validateMethodBinding', () => {
    const provider: ProviderDefinition = {
      id: 'apple-intelligence-runtime',
      name: 'Apple',
      sourceClass: 'provider',
      deterministic: true,
      localOnly: true,
      providerClass: 'sovereign_runtime',
      executionMode: 'local',
    };

    const validMethod: MethodDefinition = {
      methodId: 'apple.foundation_models.summarize',
      providerId: 'apple-intelligence-runtime',
      subsystem: 'foundation_models',
      policyTier: PolicyTier.A,
      deterministic: true,
      requiresNetwork: false,
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.object({ summary: z.string() }),
    };

    it('accepts valid method bound to provider', () => {
      expect(() => validateMethodBinding(validMethod, provider)).not.toThrow();
    });

    it('rejects method bound to capability', () => {
      const cap: CapabilityDefinition = {
        id: 'openai-api',
        name: 'OpenAI',
        sourceClass: 'capability',
        deterministic: false,
        explicitInvocationRequired: true,
        vendor: 'openai',
      };
      expect(() => validateMethodBinding(validMethod, cap)).toThrow(InvalidRegistrationError);
    });

    it('rejects method with mismatched provider ID', () => {
      const bad = { ...validMethod, providerId: 'wrong-provider' };
      expect(() => validateMethodBinding(bad, provider)).toThrow(InvalidRegistrationError);
    });

    it('rejects method with empty ID', () => {
      const bad = { ...validMethod, methodId: '' };
      expect(() => validateMethodBinding(bad, provider)).toThrow(InvalidRegistrationError);
    });
  });

  describe('rejectMixedClassRegistration', () => {
    it('passes when source class matches declared class', () => {
      const provider: ProviderDefinition = {
        id: 'test',
        name: 'Test',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      expect(() => rejectMixedClassRegistration(provider, 'provider')).not.toThrow();
    });

    it('rejects when source class does not match declared class', () => {
      const provider: ProviderDefinition = {
        id: 'test',
        name: 'Test',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };
      expect(() => rejectMixedClassRegistration(provider, 'session')).toThrow(
        InvalidRegistrationError,
      );
    });
  });
});
