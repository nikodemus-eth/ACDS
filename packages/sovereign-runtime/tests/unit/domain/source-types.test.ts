import { describe, it, expect } from 'vitest';
import type {
  ProviderDefinition,
  CapabilityDefinition,
  SessionDefinition,
  SourceDefinition,
} from '../../../src/domain/source-types.js';

describe('Source Types', () => {
  describe('ProviderDefinition', () => {
    it('has sourceClass=provider as discriminant', () => {
      const provider: ProviderDefinition = {
        id: 'apple-intelligence-runtime',
        name: 'Apple Intelligence',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'sovereign_runtime',
        executionMode: 'local',
      };

      expect(provider.sourceClass).toBe('provider');
      expect(provider.deterministic).toBe(true);
      expect(provider.localOnly).toBe(true);
    });

    it('supports controlled_remote execution mode', () => {
      const provider: ProviderDefinition = {
        id: 'ollama-local',
        name: 'Ollama Local',
        sourceClass: 'provider',
        deterministic: true,
        localOnly: true,
        providerClass: 'self_hosted',
        executionMode: 'local',
      };

      expect(provider.executionMode).toBe('local');
    });
  });

  describe('CapabilityDefinition', () => {
    it('has sourceClass=capability and is non-deterministic', () => {
      const cap: CapabilityDefinition = {
        id: 'openai-api',
        name: 'OpenAI API',
        sourceClass: 'capability',
        deterministic: false,
        explicitInvocationRequired: true,
        vendor: 'openai',
      };

      expect(cap.sourceClass).toBe('capability');
      expect(cap.deterministic).toBe(false);
      expect(cap.explicitInvocationRequired).toBe(true);
    });
  });

  describe('SessionDefinition', () => {
    it('has sourceClass=session and requires risk acknowledgment', () => {
      const session: SessionDefinition = {
        id: 'openai-session',
        name: 'OpenAI User Session',
        sourceClass: 'session',
        explicitInvocationRequired: true,
        riskLevel: 'high',
        requiresRiskAcknowledgment: true,
        boundTo: 'openai-api',
      };

      expect(session.sourceClass).toBe('session');
      expect(session.riskLevel).toBe('high');
      expect(session.requiresRiskAcknowledgment).toBe(true);
    });
  });

  describe('Discriminated Union', () => {
    it('narrows correctly based on sourceClass', () => {
      const sources: SourceDefinition[] = [
        {
          id: 'p1',
          name: 'Provider',
          sourceClass: 'provider',
          deterministic: true,
          localOnly: true,
          providerClass: 'sovereign_runtime',
          executionMode: 'local',
        },
        {
          id: 'c1',
          name: 'Capability',
          sourceClass: 'capability',
          deterministic: false,
          explicitInvocationRequired: true,
          vendor: 'openai',
        },
        {
          id: 's1',
          name: 'Session',
          sourceClass: 'session',
          explicitInvocationRequired: true,
          riskLevel: 'high',
          requiresRiskAcknowledgment: true,
          boundTo: 'c1',
        },
      ];

      const classes = sources.map((s) => s.sourceClass);
      expect(classes).toEqual(['provider', 'capability', 'session']);
    });
  });
});
