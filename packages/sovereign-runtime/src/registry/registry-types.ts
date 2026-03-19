import type { SourceDefinition, SourceClass } from '../domain/source-types.js';
import type { MethodDefinition } from '../domain/method-registry.js';

/**
 * A registry entry binds a source definition to its methods.
 */
export interface RegistryEntry {
  source: SourceDefinition;
  methods: MethodDefinition[];
}

/**
 * Query to look up sources by class or ID.
 */
export interface RegistryQuery {
  sourceClass?: SourceClass;
  sourceId?: string;
  methodId?: string;
}

/**
 * Health state for a registered provider.
 */
export type ProviderHealthState = 'healthy' | 'degraded' | 'unavailable';
