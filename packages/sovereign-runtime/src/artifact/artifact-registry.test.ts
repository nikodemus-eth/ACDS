import { describe, it, expect } from 'vitest';
import { ArtifactRegistry, ArtifactRegistryEntrySchema } from './artifact-registry.js';
import type { ArtifactRegistryEntry } from './artifact-registry.js';

function makeEntry(overrides: Partial<ArtifactRegistryEntry> = {}): ArtifactRegistryEntry {
  return {
    artifact_type: 'ACDS.Test.Action',
    artifact_version: '1.0.0',
    description: 'Test entry',
    family: 'Test',
    action: 'Action',
    supported_providers: ['apple-intelligence-runtime'],
    default_provider: 'apple-intelligence-runtime',
    provider_disposition: 'apple-preferred',
    capability_id: 'text.generate',
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: ['coherence'],
    policy_requirements: ['content_policy'],
    test_suites: ['test-suite'],
    ...overrides,
  };
}

describe('ArtifactRegistry', () => {
  it('registers and retrieves entries', () => {
    const registry = new ArtifactRegistry();
    registry.register(makeEntry());
    expect(registry.size).toBe(1);
    expect(registry.getEntry('ACDS.Test.Action')).toBeDefined();
    expect(registry.has('ACDS.Test.Action')).toBe(true);
  });

  it('getEntry returns undefined for unknown type', () => {
    const registry = new ArtifactRegistry();
    expect(registry.getEntry('ACDS.Unknown.Type')).toBeUndefined();
  });

  it('getEntriesByFamily returns entries for a family', () => {
    const registry = new ArtifactRegistry();
    registry.register(makeEntry({ artifact_type: 'ACDS.Test.A' }));
    registry.register(makeEntry({ artifact_type: 'ACDS.Test.B' }));
    expect(registry.getEntriesByFamily('Test')).toHaveLength(2);
  });

  it('getEntriesByFamily returns empty for unknown family', () => {
    const registry = new ArtifactRegistry();
    expect(registry.getEntriesByFamily('Unknown')).toHaveLength(0);
  });

  it('getAllEntries returns all', () => {
    const registry = new ArtifactRegistry();
    registry.register(makeEntry({ artifact_type: 'ACDS.Test.A' }));
    registry.register(makeEntry({ artifact_type: 'ACDS.Test.B', family: 'Other' }));
    expect(registry.getAllEntries()).toHaveLength(2);
  });

  it('families returns distinct family names', () => {
    const registry = new ArtifactRegistry();
    registry.register(makeEntry({ artifact_type: 'ACDS.Test.A', family: 'X' }));
    registry.register(makeEntry({ artifact_type: 'ACDS.Test.B', family: 'Y' }));
    expect(registry.families).toEqual(expect.arrayContaining(['X', 'Y']));
  });

  it('loadFromEntries registers multiple entries', () => {
    const registry = new ArtifactRegistry();
    registry.loadFromEntries([makeEntry({ artifact_type: 'ACDS.Test.A' }), makeEntry({ artifact_type: 'ACDS.Test.B' })]);
    expect(registry.size).toBe(2);
  });

  it('throws on invalid entry', () => {
    const registry = new ArtifactRegistry();
    expect(() => registry.register({ ...makeEntry(), artifact_type: 'invalid' })).toThrow();
  });

  it('ArtifactRegistryEntrySchema validates', () => {
    expect(ArtifactRegistryEntrySchema.safeParse(makeEntry()).success).toBe(true);
    expect(ArtifactRegistryEntrySchema.safeParse({ ...makeEntry(), artifact_type: 'bad' }).success).toBe(false);
  });
});
