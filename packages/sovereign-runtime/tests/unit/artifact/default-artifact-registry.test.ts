import { describe, it, expect } from 'vitest';
import { createDefaultArtifactRegistry, createDefaultFamilyNormalizers } from '../../../src/artifact/default-artifact-registry.js';

describe('Default Artifact Registry', () => {
  it('loads all artifact entries across all families', () => {
    const registry = createDefaultArtifactRegistry();
    // Tier 1: 4 TextAssist + 4 TextModel + 3 Image = 11
    // Tier 2: 2 Expression + 4 Vision = 6
    // Tier 3: 3 Action = 3
    expect(registry.size).toBe(20);
  });

  it('indexes all 6 families', () => {
    const registry = createDefaultArtifactRegistry();
    const families = registry.families;
    expect(families).toContain('TextAssist');
    expect(families).toContain('TextModel');
    expect(families).toContain('Image');
    expect(families).toContain('Expression');
    expect(families).toContain('Vision');
    expect(families).toContain('Action');
    expect(families).toHaveLength(6);
  });

  it('can look up individual artifact types', () => {
    const registry = createDefaultArtifactRegistry();
    expect(registry.has('ACDS.TextAssist.Rewrite.Short')).toBe(true);
    expect(registry.has('ACDS.Image.Generate.Stylized')).toBe(true);
    expect(registry.has('ACDS.Vision.Describe')).toBe(true);
    expect(registry.has('ACDS.Action.Plan')).toBe(true);
  });
});

describe('Default Family Normalizers', () => {
  it('provides normalizers for all 6 families', () => {
    const normalizers = createDefaultFamilyNormalizers();
    expect(normalizers.size).toBe(6);
    expect(normalizers.has('TextAssist')).toBe(true);
    expect(normalizers.has('TextModel')).toBe(true);
    expect(normalizers.has('Image')).toBe(true);
    expect(normalizers.has('Expression')).toBe(true);
    expect(normalizers.has('Vision')).toBe(true);
    expect(normalizers.has('Action')).toBe(true);
  });
});
