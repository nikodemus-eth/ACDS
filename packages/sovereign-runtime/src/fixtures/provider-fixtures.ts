import type { ProviderDefinition, CapabilityDefinition, SessionDefinition } from '../domain/source-types.js';

export const FIXTURES_APPLE_PROVIDER: ProviderDefinition = {
  id: 'apple-intelligence-runtime',
  name: 'Apple Intelligence Sovereign Runtime',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'sovereign_runtime',
  executionMode: 'local',
};

export const FIXTURES_OLLAMA_PROVIDER: ProviderDefinition = {
  id: 'ollama-local',
  name: 'Ollama Local',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'self_hosted',
  executionMode: 'local',
};

export const FIXTURES_OPENAI_CAPABILITY: CapabilityDefinition = {
  id: 'openai-api',
  name: 'OpenAI API',
  sourceClass: 'capability',
  deterministic: false,
  explicitInvocationRequired: true,
  vendor: 'openai',
};

export const FIXTURES_OPENAI_SESSION: SessionDefinition = {
  id: 'openai-session',
  name: 'OpenAI User Session',
  sourceClass: 'session',
  explicitInvocationRequired: true,
  riskLevel: 'high',
  requiresRiskAcknowledgment: true,
  boundTo: 'openai-api',
};
