/**
 * ARGUS-9 Tier 2 — Execution Corruption
 *
 * Tests that ExecutionOutcomePublisher and ExecutionEvaluationBridge
 * have gaps in error handling, metric coverage, and edge case behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  ExecutionOutcomePublisher,
  evaluateOutcome,
} from '@acds/execution-orchestrator';
import type {
  ExecutionOutcome,
  ExecutionOutcomeHandler,
} from '@acds/execution-orchestrator';

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    executionId: 'exec-1',
    familyKey: 'test-app:test-process:test-step',
    status: 'success',
    latencyMs: 500,
    adapterResponseSummary: {},
    timestamp: '2026-03-14T12:00:00Z',
    ...overrides,
  };
}

describe('ARGUS D1-D3: Execution Corruption', () => {

  describe('ExecutionOutcomePublisher', () => {

    it('logs handler errors to console only — no audit trail', async () => {
      // VULN: handler failures are console.error'd but not audited
      const publisher = new ExecutionOutcomePublisher();
      const captured: unknown[][] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => { captured.push(args); };

      try {
        publisher.onOutcome(() => { throw new Error('handler crashed'); });
        await publisher.publish(makeOutcome());

        const match = captured.find(
          (args) => typeof args[0] === 'string' && args[0].includes('[outcome-publisher] Handler error'),
        );
        expect(match).toBeDefined();
        expect(match![1]).toBe('handler crashed');
      } finally {
        console.error = originalError;
      }
    });

    it('permits duplicate handler registration', async () => {
      // VULN: same handler registered twice → double processing
      const publisher = new ExecutionOutcomePublisher();
      const calls: string[] = [];
      const handler: ExecutionOutcomeHandler = (o) => { calls.push(o.executionId); };

      publisher.onOutcome(handler);
      publisher.onOutcome(handler);
      await publisher.publish(makeOutcome());

      // Handler called twice
      expect(calls).toHaveLength(2);
    });

    it('continues executing remaining handlers after first throws', async () => {
      // VULN: error isolation is only console.error — no escalation path
      const publisher = new ExecutionOutcomePublisher();
      const originalError = console.error;
      console.error = () => {};
      const secondHandlerCalled = { value: false };

      try {
        publisher.onOutcome(() => { throw new Error('first fails'); });
        publisher.onOutcome(() => { secondHandlerCalled.value = true; });
        await publisher.publish(makeOutcome());

        expect(secondHandlerCalled.value).toBe(true);
      } finally {
        console.error = originalError;
      }
    });

    it('exposes mutable handler count but no way to remove handlers', () => {
      // VULN: no unsubscribe mechanism — handlers accumulate forever
      const publisher = new ExecutionOutcomePublisher();
      publisher.onOutcome(() => {});
      publisher.onOutcome(() => {});
      publisher.onOutcome(() => {});
      expect(publisher.handlerCount).toBe(3);
      // No way to remove any handler
    });
  });

  describe('ExecutionEvaluationBridge', () => {

    it('maps fallback_success to accepted with full acceptance score', () => {
      // VULN: fallback_success produces same acceptance score as primary success
      // This means the evaluation doesn't distinguish between primary and fallback outcomes
      const primaryResult = evaluateOutcome(makeOutcome({ status: 'success' }));
      const fallbackResult = evaluateOutcome(makeOutcome({ status: 'fallback_success' }));

      const primaryAcceptance = primaryResult.metricResults.find(m => m.label === 'acceptance');
      const fallbackAcceptance = fallbackResult.metricResults.find(m => m.label === 'acceptance');
      expect(primaryAcceptance?.score).toBe(fallbackAcceptance?.score);
    });

    it('computes only 2 of 9 available metrics', () => {
      // VULN: evaluation bridge only uses acceptance + latency — misses 7 metrics
      const result = evaluateOutcome(makeOutcome());
      const labels = result.metricResults.map(m => m.label);
      expect(labels).toHaveLength(2);
      expect(labels).toContain('acceptance');
      expect(labels).toContain('latency');
      // Missing: schema_compliance, correction_burden, cost, unsupported_claims,
      // confidence_alignment, artifact_quality, retry_frequency
    });

    it('accepts negative latencyMs without error', () => {
      // VULN: negative latency produces unpredictable metric score
      const result = evaluateOutcome(makeOutcome({ latencyMs: -100 }));
      const latencyMetric = result.metricResults.find(m => m.label === 'latency');
      // Negative latency should be rejected but is accepted
      expect(latencyMetric).toBeDefined();
    });

    it('accepts zero latencyMs', () => {
      // Edge case: 0ms latency → perfect score
      const result = evaluateOutcome(makeOutcome({ latencyMs: 0 }));
      const latencyMetric = result.metricResults.find(m => m.label === 'latency');
      expect(latencyMetric).toBeDefined();
      expect(latencyMetric!.score).toBeGreaterThanOrEqual(0);
    });

    it('maps unrecognized status to rejected silently', () => {
      // VULN: any non-success status becomes 'rejected' — no explicit error for bad status
      const result = evaluateOutcome(makeOutcome({ status: 'failure' }));
      const acceptance = result.metricResults.find(m => m.label === 'acceptance');
      expect(acceptance?.score).toBe(0);
    });
  });
});
