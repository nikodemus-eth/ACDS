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
});
