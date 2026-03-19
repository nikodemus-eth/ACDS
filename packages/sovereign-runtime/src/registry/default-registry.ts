import { SourceRegistry } from './registry.js';
import type { ProviderDefinition } from '../domain/source-types.js';

/**
 * The canonical Apple sovereign runtime provider definition.
 */
export const APPLE_RUNTIME_PROVIDER: ProviderDefinition = {
  id: 'apple-intelligence-runtime',
  name: 'Apple Intelligence Sovereign Runtime',
  sourceClass: 'provider',
  deterministic: true,
  localOnly: true,
  providerClass: 'sovereign_runtime',
  executionMode: 'local',
};

/**
 * Creates a registry pre-populated with the Apple sovereign runtime.
 * Apple methods are registered separately (see apple-method-registry.ts)
 * to keep platform-specific registration decoupled.
 */
export function createDefaultRegistry(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.registerProvider(APPLE_RUNTIME_PROVIDER);
  return registry;
}
