import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryLedgerSink, buildLedgerEvent } from '../ledger.js';

describe('LFSI Ledger', () => {
  let ledger: InMemoryLedgerSink;

  beforeEach(() => {
    ledger = new InMemoryLedgerSink();
  });

  describe('buildLedgerEvent', () => {
    it('produces event with UUID and ISO timestamp', () => {
      const event = buildLedgerEvent({
        taskId: 'task-1',
        sourceSystem: 'test',
        capability: 'text.summarize',
        policyProfile: 'lfsi.local_balanced',
        selectedTier: 'tier0',
        selectedProvider: 'apple.foundation',
        validationPassed: true,
        escalated: false,
        finalProvider: 'apple.foundation',
        latencyMs: 100,
        resultStatus: 'success',
        attempts: 1,
      });

      expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      expect(event.taskId).toBe('task-1');
      expect(event.capability).toBe('text.summarize');
    });
  });

  describe('InMemoryLedgerSink', () => {
    it('stores and retrieves events', () => {
      const event = buildLedgerEvent({
        taskId: 'task-1',
        sourceSystem: 'test',
        capability: 'text.summarize',
        policyProfile: 'lfsi.local_balanced',
        selectedTier: 'tier0',
        selectedProvider: 'apple.foundation',
        validationPassed: true,
        escalated: false,
        finalProvider: 'apple.foundation',
        latencyMs: 50,
        resultStatus: 'success',
        attempts: 1,
      });

      ledger.write(event);
      expect(ledger.size).toBe(1);
      expect(ledger.getAll()).toHaveLength(1);
      expect(ledger.getAll()[0].taskId).toBe('task-1');
    });

    it('finds event by taskId', () => {
      const event = buildLedgerEvent({
        taskId: 'find-me',
        sourceSystem: 'test',
        capability: 'text.rewrite',
        policyProfile: 'lfsi.apple_only',
        selectedTier: 'tier0',
        selectedProvider: 'apple.foundation',
        validationPassed: true,
        escalated: false,
        finalProvider: 'apple.foundation',
        latencyMs: 30,
        resultStatus: 'success',
        attempts: 1,
      });

      ledger.write(event);
      expect(ledger.getByTaskId('find-me')).toBeDefined();
      expect(ledger.getByTaskId('not-here')).toBeUndefined();
    });

    it('clears all events', () => {
      const event = buildLedgerEvent({
        taskId: 't',
        sourceSystem: 'test',
        capability: 'text.summarize',
        policyProfile: 'lfsi.local_balanced',
        selectedTier: 'tier0',
        selectedProvider: 'apple.foundation',
        validationPassed: true,
        escalated: false,
        finalProvider: 'apple.foundation',
        latencyMs: 10,
        resultStatus: 'success',
        attempts: 1,
      });

      ledger.write(event);
      ledger.write(event);
      expect(ledger.size).toBe(2);
      ledger.clear();
      expect(ledger.size).toBe(0);
    });

    it('returns copies from getAll', () => {
      const event = buildLedgerEvent({
        taskId: 't',
        sourceSystem: 'test',
        capability: 'text.summarize',
        policyProfile: 'lfsi.local_balanced',
        selectedTier: 'tier0',
        selectedProvider: 'apple.foundation',
        validationPassed: true,
        escalated: false,
        finalProvider: 'apple.foundation',
        latencyMs: 10,
        resultStatus: 'success',
        attempts: 1,
      });

      ledger.write(event);
      const all = ledger.getAll();
      expect(all).toHaveLength(1);
      // getAll returns a copy — mutating it doesn't affect the ledger
      (all as LedgerEvent[]).length = 0;
      expect(ledger.size).toBe(1);
    });
  });
});

// Import type for the mutation test
import type { LedgerEvent } from '../types.js';
