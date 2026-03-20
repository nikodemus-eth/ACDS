import { describe, it, expect } from 'vitest';
import { actionNormalizer, ACTION_ENTRIES } from '../../../../src/artifact/families/action.js';

describe('Action Family', () => {
  const shortcutEntry = ACTION_ENTRIES.find(e => e.artifact_type === 'ACDS.Action.Execute.Shortcut')!;
  const intentEntry = ACTION_ENTRIES.find(e => e.artifact_type === 'ACDS.Action.Execute.Intent')!;
  const planEntry = ACTION_ENTRIES.find(e => e.artifact_type === 'ACDS.Action.Plan')!;

  describe('normalizeInput', () => {
    it('Shortcut: normalizes with shortcut_name', () => {
      const result = actionNormalizer.normalizeInput(
        { shortcut_name: 'Toggle Dark Mode', parameters: { scope: 'system' } },
        shortcutEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.action).toBe('execute_shortcut');
      expect(ctx.shortcut_name).toBe('Toggle Dark Mode');
    });

    it('Shortcut: defaults dry_run to true (safety)', () => {
      const result = actionNormalizer.normalizeInput(
        { shortcut_name: 'test' },
        shortcutEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.dry_run).toBe(true);
    });

    it('Shortcut: defaults requires_confirmation to true (safety)', () => {
      const result = actionNormalizer.normalizeInput(
        { shortcut_name: 'test' },
        shortcutEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.requires_confirmation).toBe(true);
    });

    it('Shortcut: throws on missing shortcut_name', () => {
      expect(() => actionNormalizer.normalizeInput({}, shortcutEntry)).toThrow('shortcut_name');
    });

    it('Shortcut: throws on empty shortcut_name', () => {
      expect(() => actionNormalizer.normalizeInput({ shortcut_name: '' }, shortcutEntry)).toThrow('shortcut_name');
    });

    it('Intent: normalizes with intent field', () => {
      const result = actionNormalizer.normalizeInput(
        { intent: 'send_message', parameters: { to: 'user' } },
        intentEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.action).toBe('execute_intent');
      expect(ctx.intent).toBe('send_message');
      expect(ctx.dry_run).toBe(true);
      expect(ctx.requires_confirmation).toBe(true);
    });

    it('Intent: throws on missing intent', () => {
      expect(() => actionNormalizer.normalizeInput({}, intentEntry)).toThrow('intent');
    });

    it('Plan: normalizes with goal field', () => {
      const result = actionNormalizer.normalizeInput(
        { goal: 'clean up temp files', max_steps: 3 },
        planEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.action).toBe('plan');
      expect(ctx.goal).toBe('clean up temp files');
      expect(ctx.max_steps).toBe(3);
    });

    it('Plan: defaults max_steps to 5', () => {
      const result = actionNormalizer.normalizeInput(
        { goal: 'do something' },
        planEntry,
      ) as Record<string, unknown>;
      const ctx = result.context as Record<string, unknown>;
      expect(ctx.max_steps).toBe(5);
    });

    it('Plan: throws on missing goal', () => {
      expect(() => actionNormalizer.normalizeInput({}, planEntry)).toThrow('goal');
    });

    it('Plan: provides approve/modify/cancel options', () => {
      const result = actionNormalizer.normalizeInput(
        { goal: 'test' },
        planEntry,
      ) as Record<string, unknown>;
      expect(result.options).toEqual(['approve', 'modify', 'cancel']);
    });
  });

  describe('normalizeOutput', () => {
    it('Plan: returns plan, steps, reasoning', () => {
      const result = actionNormalizer.normalizeOutput(
        { decision: 'approved plan', steps: ['step1'], reasoning: 'because', confidence: 0.8 },
        planEntry,
      );
      const primary = result.primary as Record<string, unknown>;
      expect(primary.plan).toBe('approved plan');
      expect(primary.steps).toEqual(['step1']);
    });

    it('Execute: returns result and reasoning', () => {
      const result = actionNormalizer.normalizeOutput(
        { decision: 'completed', reasoning: 'done', confidence: 0.95 },
        shortcutEntry,
      );
      const primary = result.primary as Record<string, unknown>;
      expect(primary.result).toBe('completed');
    });
  });

  describe('summarizeInput', () => {
    it('uses structured source modality', () => {
      const summary = actionNormalizer.summarizeInput(
        { shortcut_name: 'Toggle Dark Mode' },
        shortcutEntry,
      );
      expect(summary.source_modality).toBe('structured');
      expect(summary.input_class).toBe('action_execute');
    });
  });

  describe('registry entries', () => {
    it('has 3 entries', () => {
      expect(ACTION_ENTRIES).toHaveLength(3);
    });

    it('Execute.Shortcut is apple-only', () => {
      expect(shortcutEntry.provider_disposition).toBe('apple-only');
    });

    it('Execute.Intent is apple-only', () => {
      expect(intentEntry.provider_disposition).toBe('apple-only');
    });

    it('Plan is apple-preferred', () => {
      expect(planEntry.provider_disposition).toBe('apple-preferred');
    });

    it('all map to agent.control.decide', () => {
      for (const entry of ACTION_ENTRIES) {
        expect(entry.capability_id).toBe('agent.control.decide');
      }
    });

    it('Execute variants require action_confirmation and audit_required', () => {
      expect(shortcutEntry.policy_requirements).toContain('action_confirmation');
      expect(shortcutEntry.policy_requirements).toContain('audit_required');
      expect(intentEntry.policy_requirements).toContain('action_confirmation');
      expect(intentEntry.policy_requirements).toContain('audit_required');
    });

    it('all are experimental tier', () => {
      for (const entry of ACTION_ENTRIES) {
        expect(entry.quality_tier).toBe('experimental');
      }
    });
  });
});
