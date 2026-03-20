import { describe, it, expect } from 'vitest';
import { ArtifactRegistry } from '../../../src/artifact/artifact-registry.js';
import type { ArtifactRegistryEntry } from '../../../src/artifact/artifact-registry.js';

function makeEntry(overrides: Partial<ArtifactRegistryEntry> = {}): ArtifactRegistryEntry {
  return {
    artifact_type: 'ACDS.Test.Action',
    artifact_version: '1.0.0',
    description: 'Test artifact',
    family: 'Test',
    action: 'Action',
    supported_providers: ['apple-intelligence-runtime'],
    default_provider: 'apple-intelligence-runtime',
    provider_disposition: 'apple-preferred',
    capability_id: 'text.rewrite',
    output_modality: 'text',
    output_format: 'plain_text',
    quality_tier: 'consumer_demo_grade',
    quality_metrics: ['coherence'],
    policy_requirements: ['content_policy'],
    test_suites: ['test'],
    ...overrides,
  };
}

describe('ArtifactRegistry', () => {
  it('registers and retrieves entries', () => {
    const registry = new ArtifactRegistry();
    const entry = makeEntry();
    registry.register(entry);
    expect(registry.getEntry('ACDS.Test.Action')).toEqual(entry);
    expect(registry.has('ACDS.Test.Action')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('loads multiple entries', () => {
    const registry = new ArtifactRegistry();
    registry.loadFromEntries([
      makeEntry({ artifact_type: 'ACDS.Test.One' }),
      makeEntry({ artifact_type: 'ACDS.Test.Two' }),
    ]);
    expect(registry.size).toBe(2);
  });

  it('indexes by family', () => {
    const registry = new ArtifactRegistry();
    registry.loadFromEntries([
      makeEntry({ artifact_type: 'ACDS.Alpha.One', family: 'Alpha' }),
      makeEntry({ artifact_type: 'ACDS.Alpha.Two', family: 'Alpha' }),
      makeEntry({ artifact_type: 'ACDS.Beta.One', family: 'Beta' }),
    ]);
    expect(registry.getEntriesByFamily('Alpha')).toHaveLength(2);
    expect(registry.getEntriesByFamily('Beta')).toHaveLength(1);
    expect(registry.getEntriesByFamily('Gamma')).toHaveLength(0);
    expect(registry.families).toContain('Alpha');
    expect(registry.families).toContain('Beta');
  });

  it('returns undefined for unknown artifact type', () => {
    const registry = new ArtifactRegistry();
    expect(registry.getEntry('ACDS.Unknown.Type')).toBeUndefined();
    expect(registry.has('ACDS.Unknown.Type')).toBe(false);
  });

  it('rejects entry with invalid artifact_type format', () => {
    const registry = new ArtifactRegistry();
    expect(() => registry.register(makeEntry({ artifact_type: 'invalid-format' }))).toThrow();
  });

  it('rejects entry with empty description', () => {
    const registry = new ArtifactRegistry();
    expect(() => registry.register(makeEntry({ description: '' }))).toThrow();
  });
});
