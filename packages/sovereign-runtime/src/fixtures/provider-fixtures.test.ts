import { describe, it, expect } from 'vitest';
import { FIXTURES_APPLE_PROVIDER, FIXTURES_OLLAMA_PROVIDER, FIXTURES_OPENAI_CAPABILITY, FIXTURES_OPENAI_SESSION } from './provider-fixtures.js';

describe('Provider Fixtures', () => {
  it('FIXTURES_APPLE_PROVIDER is a local sovereign provider', () => {
    expect(FIXTURES_APPLE_PROVIDER.id).toBe('apple-intelligence-runtime');
    expect(FIXTURES_APPLE_PROVIDER.sourceClass).toBe('provider');
    expect(FIXTURES_APPLE_PROVIDER.localOnly).toBe(true);
    expect(FIXTURES_APPLE_PROVIDER.executionMode).toBe('local');
    expect(FIXTURES_APPLE_PROVIDER.deterministic).toBe(true);
    expect(FIXTURES_APPLE_PROVIDER.providerClass).toBe('sovereign_runtime');
  });

  it('FIXTURES_OLLAMA_PROVIDER is a local self-hosted provider', () => {
    expect(FIXTURES_OLLAMA_PROVIDER.id).toBe('ollama-local');
    expect(FIXTURES_OLLAMA_PROVIDER.sourceClass).toBe('provider');
    expect(FIXTURES_OLLAMA_PROVIDER.localOnly).toBe(true);
    expect(FIXTURES_OLLAMA_PROVIDER.providerClass).toBe('self_hosted');
  });

  it('FIXTURES_OPENAI_CAPABILITY is a capability source', () => {
    expect(FIXTURES_OPENAI_CAPABILITY.id).toBe('openai-api');
    expect(FIXTURES_OPENAI_CAPABILITY.sourceClass).toBe('capability');
    expect(FIXTURES_OPENAI_CAPABILITY.deterministic).toBe(false);
    expect(FIXTURES_OPENAI_CAPABILITY.explicitInvocationRequired).toBe(true);
    expect(FIXTURES_OPENAI_CAPABILITY.vendor).toBe('openai');
  });

  it('FIXTURES_OPENAI_SESSION is a session source', () => {
    expect(FIXTURES_OPENAI_SESSION.id).toBe('openai-session');
    expect(FIXTURES_OPENAI_SESSION.sourceClass).toBe('session');
    expect(FIXTURES_OPENAI_SESSION.requiresRiskAcknowledgment).toBe(true);
    expect(FIXTURES_OPENAI_SESSION.riskLevel).toBe('high');
    expect(FIXTURES_OPENAI_SESSION.boundTo).toBe('openai-api');
  });
});
