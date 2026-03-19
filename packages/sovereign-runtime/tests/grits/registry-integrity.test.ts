import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_RUNTIME_PROVIDER } from '../../src/registry/default-registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import {
  FIXTURES_APPLE_PROVIDER,
  FIXTURES_OPENAI_CAPABILITY,
  FIXTURES_OPENAI_SESSION,
} from '../../src/fixtures/provider-fixtures.js';
import { InvalidRegistrationError } from '../../src/domain/errors.js';
import { z } from 'zod';

describe('GRITS Registry Integrity', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  it('GRITS-REG-001: provider entries cannot be misclassified as capabilities', () => {
    // Register Apple as a provider — verify sourceClass
    registry.registerProvider(FIXTURES_APPLE_PROVIDER);
    const source = registry.getSource(FIXTURES_APPLE_PROVIDER.id);
    expect(source).toBeDefined();
    expect(source!.sourceClass).toBe('provider');

    // Attempt to registerCapability with a provider definition → InvalidRegistrationError
    expect(() => {
      registry.registerCapability(FIXTURES_APPLE_PROVIDER as any);
    }).toThrow(InvalidRegistrationError);
  });

  it('GRITS-REG-002: capability entries require explicit invocation flags', () => {
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);
    const source = registry.getSource(FIXTURES_OPENAI_CAPABILITY.id);
    expect(source).toBeDefined();
    expect(source!.sourceClass).toBe('capability');
    expect((source as any).explicitInvocationRequired).toBe(true);
  });

  it('GRITS-REG-003: session entries require risk metadata', () => {
    // Register the capability first (session is bound to it)
    registry.registerCapability(FIXTURES_OPENAI_CAPABILITY);
    registry.registerSession(FIXTURES_OPENAI_SESSION);
    const source = registry.getSource(FIXTURES_OPENAI_SESSION.id);
    expect(source).toBeDefined();
    expect(source!.sourceClass).toBe('session');
    expect((source as any).riskLevel).toBeDefined();
    expect((source as any).riskLevel).toBe('high');
    expect((source as any).requiresRiskAcknowledgment).toBe(true);
  });

  it('GRITS-REG-004: all Apple methods have required metadata', () => {
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
    const methods = registry.getMethodsForProvider(FIXTURES_APPLE_PROVIDER.id);
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.length).toBe(APPLE_METHODS.length);

    for (const method of methods) {
      expect(method.providerId).toBe(FIXTURES_APPLE_PROVIDER.id);
      expect(method.subsystem).toBeDefined();
      expect(method.subsystem.length).toBeGreaterThan(0);
      expect(method.policyTier).toBeDefined();
      expect(typeof method.deterministic).toBe('boolean');
      expect(typeof method.requiresNetwork).toBe('boolean');
    }
  });

  it('GRITS-REG-005: reject mixed registration where method points to wrong class', () => {
    registry.registerProvider(FIXTURES_APPLE_PROVIDER);

    const mismatchedMethod = {
      methodId: 'openai.gpt.generate',
      providerId: 'openai-api',
      subsystem: 'foundation_models' as const,
      policyTier: 'A' as any,
      deterministic: false,
      requiresNetwork: true,
      inputSchema: z.any(),
      outputSchema: z.any(),
    };

    // Method declares providerId='openai-api' but we try to bind it to apple provider
    expect(() => {
      registry.registerProvider(FIXTURES_APPLE_PROVIDER, [mismatchedMethod]);
    }).toThrow(InvalidRegistrationError);
  });
});
