import { describe, it, expect } from 'vitest';
import { ProvenanceStage } from '../../../../src/artifact/pipeline/provenance-stage.js';
import { TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    artifactType: 'ACDS.TextAssist.Rewrite.Short',
    rawInput: {},
    options: { requestedBy: 'test-user' },
    timings: {},
    startTime: performance.now(),
    registryEntry: TEXT_ASSIST_ENTRIES[0],
    selectedProvider: 'apple-intelligence-runtime',
    selectedMethod: 'text.rewrite',
    ...overrides,
  };
}

describe('ProvenanceStage', () => {
  const stage = new ProvenanceStage();

  it('assembles provenance record', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.provenance).toBeDefined();
    expect(ctx.provenance!.requested_by).toBe('test-user');
    expect(ctx.provenance!.method).toBe('text.rewrite');
    expect(ctx.provenance!.provider_route).toContain('apple');
  });

  it('skips provenance on error', async () => {
    const ctx = makeCtx({ error: { stage: 'execution', message: 'failed', code: 'PROVIDER_UNAVAILABLE' } });
    await stage.execute(ctx);
    expect(ctx.provenance).toBeUndefined();
  });

  it('records timing', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.timings['provenance']).toBeGreaterThanOrEqual(0);
  });
});
