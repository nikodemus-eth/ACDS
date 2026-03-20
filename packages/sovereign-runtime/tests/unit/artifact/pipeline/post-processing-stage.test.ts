import { describe, it, expect } from 'vitest';
import { PostProcessingStage } from '../../../../src/artifact/pipeline/post-processing-stage.js';
import { textAssistNormalizer, TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    artifactType: 'ACDS.TextAssist.Rewrite.Short',
    rawInput: {},
    options: { requestedBy: 'test' },
    timings: {},
    startTime: performance.now(),
    registryEntry: TEXT_ASSIST_ENTRIES[0],
    rawOutput: { rewrittenText: 'improved text' },
    ...overrides,
  };
}

describe('PostProcessingStage', () => {
  const normalizers = new Map([[textAssistNormalizer.family, textAssistNormalizer]]);
  const stage = new PostProcessingStage(normalizers);

  it('normalizes output through family normalizer', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.canonicalPayload).toBeDefined();
    expect((ctx.canonicalPayload!.primary as Record<string, unknown>).text).toBe('improved text');
  });

  it('passes through raw output when no normalizer registered', async () => {
    const stageNoNorm = new PostProcessingStage(new Map());
    const ctx = makeCtx();
    await stageNoNorm.execute(ctx);
    expect(ctx.canonicalPayload).toBeDefined();
    expect(ctx.canonicalPayload!.primary).toEqual({ rewrittenText: 'improved text' });
  });

  it('sets error when no execution output', async () => {
    const ctx = makeCtx({ rawOutput: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_BLOCKED');
  });

  it('records timing', async () => {
    const ctx = makeCtx();
    await stage.execute(ctx);
    expect(ctx.timings['post_processing']).toBeGreaterThanOrEqual(0);
  });
});
