import { describe, it, expect } from 'vitest';
import { createDefaultArtifactRegistry, createDefaultFamilyNormalizers } from './default-artifact-registry.js';

describe('Default Artifact Registry', () => {
  it('createDefaultArtifactRegistry returns populated registry', () => {
    const registry = createDefaultArtifactRegistry();
    expect(registry.size).toBeGreaterThan(0);
    expect(registry.families.length).toBeGreaterThan(0);
  });

  it('has entries from all artifact families', () => {
    const registry = createDefaultArtifactRegistry();
    expect(registry.getEntriesByFamily('TextAssist').length).toBeGreaterThan(0);
    expect(registry.getEntriesByFamily('TextModel').length).toBeGreaterThan(0);
    expect(registry.getEntriesByFamily('Image').length).toBeGreaterThan(0);
    expect(registry.getEntriesByFamily('Expression').length).toBeGreaterThan(0);
    expect(registry.getEntriesByFamily('Vision').length).toBeGreaterThan(0);
    expect(registry.getEntriesByFamily('Action').length).toBeGreaterThan(0);
  });

  it('createDefaultFamilyNormalizers returns normalizers for all families', () => {
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
