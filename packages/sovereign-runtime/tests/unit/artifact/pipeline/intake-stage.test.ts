import { describe, it, expect } from 'vitest';
import { IntakeStage } from '../../../../src/artifact/pipeline/intake-stage.js';
import { ArtifactRegistry } from '../../../../src/artifact/artifact-registry.js';
import { textAssistNormalizer, TEXT_ASSIST_ENTRIES } from '../../../../src/artifact/families/text-assist.js';
import type { PipelineContext } from '../../../../src/artifact/pipeline/pipeline-types.js';

function makeCtx(artifactType: string, rawInput: unknown): PipelineContext {
  return {
    artifactType,
    rawInput,
    options: { requestedBy: 'test' },
    timings: {},
    startTime: performance.now(),
  };
}

describe('IntakeStage', () => {
  const registry = new ArtifactRegistry();
  registry.loadFromEntries(TEXT_ASSIST_ENTRIES);
  const normalizers = new Map([[textAssistNormalizer.family, textAssistNormalizer]]);
  const stage = new IntakeStage(registry, normalizers);

  it('resolves known artifact type and sets registry entry', async () => {
    const ctx = makeCtx('ACDS.TextAssist.Rewrite.Short', { source_text: 'hello' });
    await stage.execute(ctx);
    expect(ctx.registryEntry).toBeDefined();
    expect(ctx.capabilityId).toBe('text.rewrite');
    expect(ctx.normalizedInput).toBeDefined();
    expect(ctx.error).toBeUndefined();
  });

  it('sets error for unknown artifact type', async () => {
    const ctx = makeCtx('ACDS.Unknown.Type', {});
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('ARTIFACT_REGISTRY_ERROR');
  });

  it('sets error when input validation fails', async () => {
    const ctx = makeCtx('ACDS.TextAssist.Rewrite.Short', { source_text: '' });
    await stage.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('VALIDATION_FAILED');
  });

  it('computes input summary', async () => {
    const ctx = makeCtx('ACDS.TextAssist.Summarize.Short', { source_text: 'test text' });
    await stage.execute(ctx);
    expect(ctx.inputSummary).toBeDefined();
    expect(ctx.inputSummary!.source_modality).toBe('text');
  });

  it('records timing', async () => {
    const ctx = makeCtx('ACDS.TextAssist.Proofread', { source_text: 'test' });
    await stage.execute(ctx);
    expect(ctx.timings['intake']).toBeGreaterThanOrEqual(0);
  });

  it('passes through raw input when no normalizer is registered for family', async () => {
    const registryNoNorm = new ArtifactRegistry();
    registryNoNorm.loadFromEntries(TEXT_ASSIST_ENTRIES);
    const stageNoNorm = new IntakeStage(registryNoNorm, new Map());
    const rawInput = { source_text: 'hello' };
    const ctx = makeCtx('ACDS.TextAssist.Rewrite.Short', rawInput);
    await stageNoNorm.execute(ctx);
    expect(ctx.normalizedInput).toBe(rawInput);
    expect(ctx.inputSummary).toBeDefined();
    expect(ctx.inputSummary!.source_modality).toBe('unknown');
    expect(ctx.inputSummary!.input_class).toBe('raw');
    expect(ctx.inputSummary!.summary).toContain('ACDS.TextAssist.Rewrite.Short');
    expect(ctx.error).toBeUndefined();
  });

  it('sets output modality and format from registry entry', async () => {
    const ctx = makeCtx('ACDS.TextAssist.Rewrite.Short', { source_text: 'hello' });
    await stage.execute(ctx);
    expect(ctx.outputModality).toBe('text');
    expect(ctx.outputFormat).toBe('plain_text');
  });

  it('handles non-Error throw from normalizer', async () => {
    const throwingNormalizer = {
      family: 'TextAssist',
      qualityDimensions: [],
      normalizeInput: () => { throw 'raw string error'; },
      normalizeOutput: () => ({ primary: {} }),
      summarizeInput: () => ({ source_modality: '', input_class: '', input_size: 0, summary: '' }),
    };
    const registryWithThrow = new ArtifactRegistry();
    registryWithThrow.loadFromEntries(TEXT_ASSIST_ENTRIES);
    const stageWithThrow = new IntakeStage(registryWithThrow, new Map([['TextAssist', throwingNormalizer]]));
    const ctx = makeCtx('ACDS.TextAssist.Rewrite.Short', { source_text: 'hello' });
    await stageWithThrow.execute(ctx);
    expect(ctx.error).toBeDefined();
    expect(ctx.error!.code).toBe('VALIDATION_FAILED');
    expect(ctx.error!.message).toBe('Input normalization failed');
  });

  it('computes input_size for passthrough based on JSON length', async () => {
    const registryNoNorm = new ArtifactRegistry();
    registryNoNorm.loadFromEntries(TEXT_ASSIST_ENTRIES);
    const stageNoNorm = new IntakeStage(registryNoNorm, new Map());
    const rawInput = { key: 'value' };
    const ctx = makeCtx('ACDS.TextAssist.Rewrite.Short', rawInput);
    await stageNoNorm.execute(ctx);
    expect(ctx.inputSummary!.input_size).toBe(JSON.stringify(rawInput).length);
  });

  it('sets error stage to intake on failure', async () => {
    const ctx = makeCtx('ACDS.Unknown.Missing', {});
    await stage.execute(ctx);
    expect(ctx.error!.stage).toBe('intake');
  });
});
