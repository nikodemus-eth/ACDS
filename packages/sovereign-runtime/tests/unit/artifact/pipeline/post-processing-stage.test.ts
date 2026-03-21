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

  it('preserves pre-existing error and does not overwrite it', async () => {
    const existingError = { stage: 'execution', message: 'Provider timed out', code: 'TIMEOUT' };
    const ctx = makeCtx({ error: existingError, rawOutput: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBe(existingError);
    expect(ctx.error!.stage).toBe('execution');
  });

  it('sets its own error when rawOutput is undefined but no prior error', async () => {
    const ctx = makeCtx({ rawOutput: undefined, error: undefined });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.stage).toBe('post_processing');
    expect(ctx.error!.message).toContain('no execution output');
  });

  it('catches normalizer exception and sets VALIDATION_FAILED error', async () => {
    const throwingNormalizer = {
      family: 'TextAssist',
      qualityDimensions: [],
      normalizeInput: () => ({}),
      normalizeOutput: () => { throw new Error('bad output format'); },
      summarizeInput: () => ({ source_modality: '', input_class: '', input_size: 0, summary: '' }),
    };
    const stageWithThrowing = new PostProcessingStage(new Map([['TextAssist', throwingNormalizer]]));
    const ctx = makeCtx();
    await stageWithThrowing.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('VALIDATION_FAILED');
    expect(ctx.error!.message).toBe('bad output format');
  });

  it('catches non-Error exception from normalizer', async () => {
    const throwingNormalizer = {
      family: 'TextAssist',
      qualityDimensions: [],
      normalizeInput: () => ({}),
      normalizeOutput: () => { throw 'string throw'; },
      summarizeInput: () => ({ source_modality: '', input_class: '', input_size: 0, summary: '' }),
    };
    const stageWithThrowing = new PostProcessingStage(new Map([['TextAssist', throwingNormalizer]]));
    const ctx = makeCtx();
    await stageWithThrowing.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('VALIDATION_FAILED');
    expect(ctx.error!.message).toBe('Output normalization failed');
  });

  it('skips normalizer when registryEntry has unknown family', async () => {
    const ctx = makeCtx({
      registryEntry: { ...TEXT_ASSIST_ENTRIES[0], family: 'UnknownFamily' },
    });
    await stage.execute(ctx);
    expect(ctx.canonicalPayload).toBeDefined();
    expect(ctx.canonicalPayload!.primary).toEqual({ rewrittenText: 'improved text' });
  });

  it('skips normalizer when registryEntry is undefined', async () => {
    const ctx = makeCtx({ registryEntry: undefined, rawOutput: { data: 42 } });
    await stage.execute(ctx);
    expect(ctx.canonicalPayload).toBeDefined();
    expect(ctx.canonicalPayload!.primary).toEqual({ data: 42 });
  });
});
