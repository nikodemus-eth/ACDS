import type { SourceDefinition, SourceClass } from '../domain/source-types.js';
import type { MethodDefinition } from '../domain/method-registry.js';
import type { RegistryEntry, ProviderHealthState } from './registry-types.js';
import {
  validateSourceDefinition,
  validateMethodBinding,
  rejectMixedClassRegistration,
} from './registry-validation.js';
import { InvalidRegistrationError } from '../domain/errors.js';

/**
 * In-memory registry for Providers, Capabilities, and Sessions.
 *
 * Enforces strict class boundaries: methods can only be bound to providers,
 * mixed-class registrations are rejected, and lookups are typed.
 */
export class SourceRegistry {
  private readonly sources = new Map<string, RegistryEntry>();
  private readonly methodIndex = new Map<string, MethodDefinition>();
  private readonly healthStates = new Map<string, ProviderHealthState>();

  /**
   * Register a provider source with its methods.
   */
  registerProvider(source: SourceDefinition, methods: MethodDefinition[] = []): void {
    rejectMixedClassRegistration(source, 'provider');
    validateSourceDefinition(source);

    for (const method of methods) {
      validateMethodBinding(method, source);
      if (this.methodIndex.has(method.methodId)) {
        throw new InvalidRegistrationError(
          `Method ${method.methodId} is already registered`,
          { methodId: method.methodId },
        );
      }
    }

    this.sources.set(source.id, { source, methods });
    for (const method of methods) {
      this.methodIndex.set(method.methodId, method);
    }
    this.healthStates.set(source.id, 'healthy');
  }

  /**
   * Register a capability source.
   */
  registerCapability(source: SourceDefinition): void {
    rejectMixedClassRegistration(source, 'capability');
    validateSourceDefinition(source);
    this.sources.set(source.id, { source, methods: [] });
  }

  /**
   * Register a session source.
   */
  registerSession(source: SourceDefinition): void {
    rejectMixedClassRegistration(source, 'session');
    validateSourceDefinition(source);
    this.sources.set(source.id, { source, methods: [] });
  }

  /**
   * Get a source by ID.
   */
  getSource(sourceId: string): SourceDefinition | undefined {
    return this.sources.get(sourceId)?.source;
  }

  /**
   * Get a method by its fully qualified ID.
   */
  getMethod(methodId: string): MethodDefinition | undefined {
    return this.methodIndex.get(methodId);
  }

  /**
   * Get all methods for a provider.
   */
  getMethodsForProvider(providerId: string): MethodDefinition[] {
    return this.sources.get(providerId)?.methods ?? [];
  }

  /**
   * Get all sources of a specific class.
   */
  getSourcesByClass(sourceClass: SourceClass): SourceDefinition[] {
    const results: SourceDefinition[] = [];
    for (const entry of this.sources.values()) {
      if (entry.source.sourceClass === sourceClass) {
        results.push(entry.source);
      }
    }
    return results;
  }

  /**
   * Get all registered method definitions.
   */
  getAllMethods(): MethodDefinition[] {
    return Array.from(this.methodIndex.values());
  }

  /**
   * Get or set provider health state.
   */
  getHealthState(providerId: string): ProviderHealthState | undefined {
    return this.healthStates.get(providerId);
  }

  setHealthState(providerId: string, state: ProviderHealthState): void {
    if (!this.sources.has(providerId)) {
      throw new InvalidRegistrationError(`Cannot set health for unknown source: ${providerId}`);
    }
    this.healthStates.set(providerId, state);
  }

  /**
   * Check if a source exists.
   */
  has(sourceId: string): boolean {
    return this.sources.has(sourceId);
  }

  /**
   * Get the total number of registered sources.
   */
  get size(): number {
    return this.sources.size;
  }
}
