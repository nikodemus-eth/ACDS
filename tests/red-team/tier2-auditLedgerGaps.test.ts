/**
 * ARGUS-9 Tier 2 — Audit Ledger Gaps
 *
 * Tests that audit events, adaptation events, and rollback/approval
 * audit trails have missing entries, unredacted data, and integrity gaps.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAdaptationEvent,
  AdaptationApprovalService,
  AdaptationRollbackService,
} from '@acds/adaptive-optimizer';
import type { RollbackAuditEvent } from '@acds/adaptive-optimizer';
import {
  makeRankedCandidate,
  makeAdaptationEvent,
  makeRecommendation,
  InMemoryAdaptationLedger,
  InMemoryApprovalRepository,
  InMemoryOptimizerStateRepository,
  InMemoryRollbackRecordWriter,
  CollectingApprovalAuditEmitter,
  CollectingRollbackAuditEmitter,
  makeFamilyState,
  makeCandidateState,
} from './_fixtures.js';

describe('ARGUS E1-E4: Audit Ledger Gaps', () => {

  describe('buildAdaptationEvent — data integrity', () => {

    it('accepts empty previousRanking and newRanking', () => {
      // VULN: adaptation event with no ranking data is meaningless but accepted
      const event = buildAdaptationEvent({
        id: 'evt-empty',
        familyKey: 'test:family:key',
        previousRanking: [],
        newRanking: [],
        trigger: 'manual',
        evidenceSummary: '',
        mode: 'observe_only',
        policyBoundsSnapshot: {
          explorationRate: 0,
          mode: 'observe_only',
          additionalConstraints: {},
        },
      });
      expect(event.previousRanking).toHaveLength(0);
      expect(event.newRanking).toHaveLength(0);
      expect(event.evidenceSummary).toBe('');
    });

    it('passes secrets in evidenceSummary unredacted', () => {
      // VULN: evidenceSummary is a free-text field with no redaction
      const event = buildAdaptationEvent({
        id: 'evt-secret',
        familyKey: 'test:family:key',
        previousRanking: [makeRankedCandidate()],
        newRanking: [makeRankedCandidate()],
        trigger: 'manual',
        evidenceSummary: 'API key sk-live-abc123 was used during scoring',
        mode: 'recommend_only',
        policyBoundsSnapshot: {
          explorationRate: 0.1,
          mode: 'recommend_only',
          additionalConstraints: {},
        },
      });
      expect(event.evidenceSummary).toContain('sk-live-abc123');
    });

    it('accepts policyBoundsSnapshot with arbitrary additionalConstraints', () => {
      // VULN: additionalConstraints is Record<string, unknown> — anything goes
      const event = buildAdaptationEvent({
        id: 'evt-constraints',
        familyKey: 'test:family:key',
        previousRanking: [],
        newRanking: [],
        trigger: 'scheduled',
        evidenceSummary: 'test',
        mode: 'fully_applied',
        policyBoundsSnapshot: {
          explorationRate: 0.1,
          mode: 'fully_applied',
          additionalConstraints: {
            secretApiKey: 'sk-live-leaked-in-audit',
            __proto__: { polluted: true },
          },
        },
      });
      expect(event.policyBoundsSnapshot.additionalConstraints).toHaveProperty('secretApiKey');
    });
  });

  describe('AdaptationApprovalService — audit completeness', () => {

    it('emits approval_submitted but not superseded on re-submission', () => {
      // VULN: superseded status type exists but is never set via the service API
      const repo = new InMemoryApprovalRepository();
      const emitter = new CollectingApprovalAuditEmitter();
      const service = new AdaptationApprovalService(repo, emitter);

      const rec1 = makeRecommendation({ id: 'rec-1' });
      const rec2 = makeRecommendation({ id: 'rec-2' });

      service.submitForApproval(rec1);
      service.submitForApproval(rec2);

      const eventTypes = emitter.events.map(e => e.type);
      expect(eventTypes).not.toContain('approval_superseded');
      // Both are 'approval_submitted' — first is never superseded
    });

    it('emits approval_expired with no actor field', () => {
      // VULN: expired events have no actor — no attribution
      const repo = new InMemoryApprovalRepository();
      const emitter = new CollectingApprovalAuditEmitter();
      const service = new AdaptationApprovalService(repo, emitter);

      const rec = makeRecommendation({ id: 'rec-exp' });
      service.submitForApproval(rec, 1); // 1ms TTL — instantly expirable
      // Wait a tick then expire
      return new Promise<void>((resolve) => {
        setTimeout(async () => {
          await service.expireStale();
          const expiredEvents = emitter.events.filter(e => e.type === 'approval_expired');
          for (const evt of expiredEvents) {
            expect(evt.actor).toBeUndefined();
          }
          resolve();
        }, 10);
      });
    });
  });

  describe('AdaptationRollbackService — audit completeness', () => {

    it('does not emit rollback_previewed event during previewRollback', () => {
      // VULN: rollback_previewed type is defined but never emitted
      const ledger = new InMemoryAdaptationLedger();
      const optimizerRepo = new InMemoryOptimizerStateRepository();
      const rollbackWriter = new InMemoryRollbackRecordWriter();
      const emitter = new CollectingRollbackAuditEmitter();

      const event = makeAdaptationEvent({ id: 'evt-for-preview', createdAt: new Date().toISOString() });
      ledger.events.push(event);

      const state = makeFamilyState({ familyKey: event.familyKey });
      optimizerRepo.familyStates.set(event.familyKey, state);
      optimizerRepo.candidateStates.set(event.familyKey, [
        makeCandidateState({ familyKey: event.familyKey }),
      ]);

      const service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, emitter);
      return service.previewRollback(event.familyKey, event.id).then(() => {
        const previewEvents = emitter.events.filter(
          (e: RollbackAuditEvent) => e.type === 'rollback_previewed'
        );
        expect(previewEvents).toHaveLength(0);
      });
    });

    it('emits rollback_executed with user-supplied actor — no authorization', () => {
      // VULN: any string accepted as actor — no authorization check
      const ledger = new InMemoryAdaptationLedger();
      const optimizerRepo = new InMemoryOptimizerStateRepository();
      const rollbackWriter = new InMemoryRollbackRecordWriter();
      const emitter = new CollectingRollbackAuditEmitter();

      const event = makeAdaptationEvent({ id: 'evt-rb', createdAt: new Date().toISOString() });
      ledger.events.push(event);

      const state = makeFamilyState({ familyKey: event.familyKey });
      optimizerRepo.familyStates.set(event.familyKey, state);
      optimizerRepo.candidateStates.set(event.familyKey, [
        makeCandidateState({ familyKey: event.familyKey }),
      ]);

      const service = new AdaptationRollbackService(ledger, optimizerRepo, rollbackWriter, emitter);
      return service.executeRollback(event.familyKey, event.id, 'anyone', 'any reason').then(() => {
        const executedEvents = emitter.events.filter(
          (e: RollbackAuditEvent) => e.type === 'rollback_executed'
        );
        expect(executedEvents).toHaveLength(1);
        expect(executedEvents[0].actor).toBe('anyone');
      });
    });
  });

  describe('No hash chain or signature', () => {

    it('produces mutable adaptation events with no integrity protection', () => {
      // VULN: events can be mutated after creation — no hash chain, no signature
      const event = makeAdaptationEvent();
      const originalId = event.id;
      event.id = 'tampered-id';
      event.evidenceSummary = 'tampered evidence';
      // No mechanism to detect this tampering
      expect(event.id).toBe('tampered-id');
      expect(event.id).not.toBe(originalId);
    });
  });
});
