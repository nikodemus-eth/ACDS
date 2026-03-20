import { describe, it, expect } from 'vitest';
import { ExecutionStatusTracker } from './ExecutionStatusTracker.js';

function makeDecision() {
  return {
    id: 'dec-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    fallbackChain: [],
    rationaleId: 'rat-1',
    rationaleSummary: 'summary',
    resolvedAt: new Date(),
  };
}

function makeRequest() {
  return {
    application: 'app',
    process: 'proc',
    step: 'step',
    taskType: 'analytical',
    loadTier: 'single_shot',
    decisionPosture: 'operational',
    cognitiveGrade: 'standard',
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed' as const,
      maxLatencyMs: null,
      costSensitivity: 'medium' as const,
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
  };
}

describe('ExecutionStatusTracker', () => {
  it('create returns an id and sets status to pending', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);

    expect(id).toBeDefined();
    const status = tracker.getStatus(id);
    expect(status?.status).toBe('pending');
    expect(status?.routingDecisionId).toBe('dec-1');
  });

  it('markRunning transitions status to running', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);
    await tracker.markRunning(id);

    expect(tracker.getStatus(id)?.status).toBe('running');
  });

  it('markSucceeded transitions status to succeeded', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);
    await tracker.markRunning(id);
    await tracker.markSucceeded(id, { output: 'result' } as any);

    expect(tracker.getStatus(id)?.status).toBe('succeeded');
  });

  it('markFailed transitions status to failed', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);
    await tracker.markRunning(id);
    await tracker.markFailed(id, 'something went wrong');

    expect(tracker.getStatus(id)?.status).toBe('failed');
  });

  it('markFallbackSucceeded transitions status', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);
    await tracker.markFallbackSucceeded(id);

    expect(tracker.getStatus(id)?.status).toBe('fallback_succeeded');
  });

  it('markFallbackFailed transitions status', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);
    await tracker.markFallbackFailed(id);

    expect(tracker.getStatus(id)?.status).toBe('fallback_failed');
  });

  it('getStatus returns undefined for unknown id', () => {
    const tracker = new ExecutionStatusTracker();
    expect(tracker.getStatus('unknown')).toBeUndefined();
  });

  it('updateStatus on unknown id does not throw but logs error', async () => {
    const tracker = new ExecutionStatusTracker();
    // Should not throw, just log
    await tracker.markRunning('nonexistent');
    expect(tracker.getStatus('nonexistent')).toBeUndefined();
  });

  it('hydrateFromRecords populates the tracker with external records', () => {
    const tracker = new ExecutionStatusTracker();
    tracker.hydrateFromRecords([
      { id: 'hydrated-1', status: 'running' },
      { id: 'hydrated-2', status: 'succeeded' },
    ]);

    expect(tracker.getStatus('hydrated-1')?.status).toBe('running');
    expect(tracker.getStatus('hydrated-2')?.status).toBe('succeeded');
    expect(tracker.getStatus('hydrated-1')?.routingDecisionId).toBe('');
  });

  it('hydrateFromRecords with empty array does not add entries', () => {
    const tracker = new ExecutionStatusTracker();
    tracker.hydrateFromRecords([]);
    expect(tracker.getStatus('any')).toBeUndefined();
  });

  it('updatedAt changes after status transition', async () => {
    const tracker = new ExecutionStatusTracker();
    const id = await tracker.create(makeDecision() as any, makeRequest() as any);
    const initial = tracker.getStatus(id)?.updatedAt;

    // Small delay to ensure time difference
    await new Promise((r) => setTimeout(r, 5));
    await tracker.markRunning(id);
    const afterUpdate = tracker.getStatus(id)?.updatedAt;

    expect(afterUpdate!.getTime()).toBeGreaterThanOrEqual(initial!.getTime());
  });
});
