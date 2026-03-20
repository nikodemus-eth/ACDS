import { describe, it, expect } from 'vitest';
import { ArtifactPresenter } from './ArtifactPresenter.js';
import type { ArtifactRegistryEntry } from '@acds/sovereign-runtime';

function makeEntry(overrides: Partial<ArtifactRegistryEntry> = {}): ArtifactRegistryEntry {
  return {
    artifact_type: 'ACDS.TextAssist.Generate',
    artifact_version: '1.0.0',
    description: 'Text generation',
    family: 'text-assist',
    action: 'generate',
    variant: undefined,
    supported_providers: ['openai', 'ollama'],
    default_provider: 'openai',
    provider_disposition: 'apple-optional' as any,
    capability_id: 'text.generate',
    output_modality: 'text' as any,
    output_format: 'plain_text' as any,
    quality_tier: 'production' as any,
    quality_metrics: ['coherence', 'accuracy'],
    policy_requirements: ['data-privacy'],
    test_suites: ['text-gen-suite'],
    ...overrides,
  };
}

describe('ArtifactPresenter', () => {
  describe('toView', () => {
    it('maps all fields from ArtifactRegistryEntry', () => {
      const entry = makeEntry();
      const view = ArtifactPresenter.toView(entry);

      expect(view.artifact_type).toBe('ACDS.TextAssist.Generate');
      expect(view.artifact_version).toBe('1.0.0');
      expect(view.description).toBe('Text generation');
      expect(view.family).toBe('text-assist');
      expect(view.action).toBe('generate');
      expect(view.variant).toBeUndefined();
      expect(view.supported_providers).toEqual(['openai', 'ollama']);
      expect(view.default_provider).toBe('openai');
      expect(view.provider_disposition).toBe('apple-optional');
      expect(view.capability_id).toBe('text.generate');
      expect(view.output_modality).toBe('text');
      expect(view.output_format).toBe('plain_text');
      expect(view.quality_tier).toBe('production');
      expect(view.quality_metrics).toEqual(['coherence', 'accuracy']);
      expect(view.policy_requirements).toEqual(['data-privacy']);
      expect(view.test_suites).toEqual(['text-gen-suite']);
    });

    it('includes variant when provided', () => {
      const entry = makeEntry({ variant: 'compact' });
      const view = ArtifactPresenter.toView(entry);
      expect(view.variant).toBe('compact');
    });
  });

  describe('toViewList', () => {
    it('maps an array of entries', () => {
      const entries = [
        makeEntry({ artifact_type: 'ACDS.TextAssist.Generate' }),
        makeEntry({ artifact_type: 'ACDS.TextAssist.Summarize' }),
      ];
      const views = ArtifactPresenter.toViewList(entries);
      expect(views).toHaveLength(2);
      expect(views[0].artifact_type).toBe('ACDS.TextAssist.Generate');
      expect(views[1].artifact_type).toBe('ACDS.TextAssist.Summarize');
    });

    it('returns empty array for empty input', () => {
      expect(ArtifactPresenter.toViewList([])).toEqual([]);
    });
  });

  describe('toFamilySummary', () => {
    it('summarizes a family with entries', () => {
      const entries = [
        makeEntry({ artifact_type: 'ACDS.TextAssist.Generate', provider_disposition: 'apple-optional' as any, output_modality: 'text' as any }),
        makeEntry({ artifact_type: 'ACDS.TextAssist.Summarize', provider_disposition: 'apple-preferred' as any, output_modality: 'text' as any }),
      ];
      const summary = ArtifactPresenter.toFamilySummary('text-assist', entries);

      expect(summary.family).toBe('text-assist');
      expect(summary.count).toBe(2);
      expect(summary.artifact_types).toEqual(['ACDS.TextAssist.Generate', 'ACDS.TextAssist.Summarize']);
      expect(summary.dispositions).toContain('apple-optional');
      expect(summary.dispositions).toContain('apple-preferred');
      expect(summary.output_modalities).toEqual(['text']);
    });

    it('deduplicates dispositions and modalities', () => {
      const entries = [
        makeEntry({ provider_disposition: 'apple-optional' as any, output_modality: 'text' as any }),
        makeEntry({ provider_disposition: 'apple-optional' as any, output_modality: 'text' as any }),
      ];
      const summary = ArtifactPresenter.toFamilySummary('fam', entries);
      expect(summary.dispositions).toHaveLength(1);
      expect(summary.output_modalities).toHaveLength(1);
    });
  });

  describe('toFamilySummaryList', () => {
    it('produces summaries for each family in the map', () => {
      const map = new Map<string, ArtifactRegistryEntry[]>();
      map.set('text-assist', [makeEntry({ family: 'text-assist' })]);
      map.set('image', [makeEntry({ family: 'image', output_modality: 'image' as any })]);

      const summaries = ArtifactPresenter.toFamilySummaryList(map);
      expect(summaries).toHaveLength(2);
      expect(summaries[0].family).toBe('text-assist');
      expect(summaries[1].family).toBe('image');
    });

    it('returns empty array for empty map', () => {
      const summaries = ArtifactPresenter.toFamilySummaryList(new Map());
      expect(summaries).toEqual([]);
    });
  });
});
