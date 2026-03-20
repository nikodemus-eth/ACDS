import { describe, it, expect } from 'vitest';
import { ArtifactsController } from './ArtifactsController.js';
import { ArtifactRegistry } from '@acds/sovereign-runtime';
import type { ArtifactRegistryEntry } from '@acds/sovereign-runtime';

function makeEntry(overrides: Partial<ArtifactRegistryEntry> = {}): ArtifactRegistryEntry {
  return {
    artifact_type: 'ACDS.TextAssist.Generate',
    artifact_version: '1.0.0',
    description: 'Text generation',
    family: 'text-assist',
    action: 'generate',
    supported_providers: ['openai'],
    default_provider: 'openai',
    provider_disposition: 'apple-optional' as any,
    capability_id: 'text.generate',
    output_modality: 'text' as any,
    output_format: 'plain_text' as any,
    quality_tier: 'production' as any,
    quality_metrics: ['coherence'],
    policy_requirements: [],
    test_suites: ['basic'],
    ...overrides,
  };
}

function buildRegistry(...entries: ArtifactRegistryEntry[]): ArtifactRegistry {
  const registry = new ArtifactRegistry();
  registry.loadFromEntries(entries);
  return registry;
}

function mockReply() {
  let statusCode = 200;
  let body: unknown;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(data: unknown) {
      body = data;
    },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

function mockRequest(params: Record<string, string> = {}) {
  return { params } as any;
}

describe('ArtifactsController', () => {
  const entry1 = makeEntry();
  const entry2 = makeEntry({
    artifact_type: 'ACDS.TextAssist.Summarize',
    action: 'summarize',
    provider_disposition: 'apple-preferred' as any,
    quality_tier: 'experimental' as any,
  });

  describe('list', () => {
    it('returns all entries as view list', async () => {
      const registry = buildRegistry(entry1, entry2);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.list(mockRequest(), reply as any);
      const body = reply.getBody() as any[];
      expect(body).toHaveLength(2);
    });

    it('returns empty array when registry is empty', async () => {
      const controller = new ArtifactsController(new ArtifactRegistry());
      const reply = mockReply();

      await controller.list(mockRequest(), reply as any);
      expect(reply.getBody()).toEqual([]);
    });
  });

  describe('listFamilies', () => {
    it('returns family summaries', async () => {
      const registry = buildRegistry(entry1, entry2);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.listFamilies(mockRequest(), reply as any);
      const body = reply.getBody() as any[];
      expect(body).toHaveLength(1);
      expect(body[0].family).toBe('text-assist');
      expect(body[0].count).toBe(2);
    });
  });

  describe('getFamily', () => {
    it('returns entries for an existing family', async () => {
      const registry = buildRegistry(entry1);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.getFamily(mockRequest({ family: 'text-assist' }), reply as any);
      const body = reply.getBody() as any;
      expect(body.family).toBe('text-assist');
      expect(body.entries).toHaveLength(1);
    });

    it('returns 404 for unknown family', async () => {
      const registry = buildRegistry(entry1);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.getFamily(mockRequest({ family: 'nonexistent' }), reply as any);
      expect(reply.getStatus()).toBe(404);
      expect((reply.getBody() as any).statusCode).toBe(404);
    });
  });

  describe('getByType', () => {
    it('returns an entry by artifact type', async () => {
      const registry = buildRegistry(entry1);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.getByType(mockRequest({ artifactType: 'ACDS.TextAssist.Generate' }), reply as any);
      const body = reply.getBody() as any;
      expect(body.artifact_type).toBe('ACDS.TextAssist.Generate');
    });

    it('returns 404 for unknown artifact type', async () => {
      const registry = buildRegistry(entry1);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.getByType(mockRequest({ artifactType: 'ACDS.Unknown.Type' }), reply as any);
      expect(reply.getStatus()).toBe(404);
      expect((reply.getBody() as any).message).toContain('ACDS.Unknown.Type');
    });
  });

  describe('stats', () => {
    it('returns aggregate statistics', async () => {
      const registry = buildRegistry(entry1, entry2);
      const controller = new ArtifactsController(registry);
      const reply = mockReply();

      await controller.stats(mockRequest(), reply as any);
      const body = reply.getBody() as any;
      expect(body.total_artifacts).toBe(2);
      expect(body.total_families).toBe(1);
      expect(body.families).toContain('text-assist');
      expect(body.by_disposition).toHaveProperty('apple-optional');
      expect(body.by_disposition).toHaveProperty('apple-preferred');
      expect(body.by_modality).toHaveProperty('text');
      expect(body.by_quality_tier).toHaveProperty('production');
      expect(body.by_quality_tier).toHaveProperty('experimental');
    });

    it('returns zeroed stats for empty registry', async () => {
      const controller = new ArtifactsController(new ArtifactRegistry());
      const reply = mockReply();

      await controller.stats(mockRequest(), reply as any);
      const body = reply.getBody() as any;
      expect(body.total_artifacts).toBe(0);
      expect(body.total_families).toBe(0);
    });
  });
});
