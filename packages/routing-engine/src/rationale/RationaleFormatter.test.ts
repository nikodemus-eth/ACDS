import { describe, it, expect } from 'vitest';
import { RationaleFormatter } from './RationaleFormatter.js';

function makeRationale(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rat-1',
    routingDecisionId: 'dec-1',
    executionFamilyKey: 'app.proc.step.operational.standard',
    selectedProfileReason: 'Profile cloud_reasoning selected: supports analytical/single_shot',
    selectedTacticReason: 'Tactic single_pass selected: method single_pass',
    selectedProviderReason: 'Provider prov-1 assigned to profile cloud_reasoning',
    policyMatchSummary: 'Privacy: cloud_allowed, Cost: medium, Escalation: false',
    eligibleProfileCount: 3,
    eligibleTacticCount: 2,
    constraintsSummary: 'Structured: false, Traceable: false',
    createdAt: new Date('2026-03-15T10:00:00Z'),
    ...overrides,
  };
}

describe('RationaleFormatter', () => {
  it('formats a rationale with all fields', () => {
    const formatter = new RationaleFormatter();
    const result = formatter.format(makeRationale());

    expect(result.id).toBe('rat-1');
    expect(result.routingDecisionId).toBe('dec-1');
    expect(result.executionFamilyKey).toBe('app.proc.step.operational.standard');
    expect(result.createdAt).toBe('2026-03-15T10:00:00.000Z');
  });

  it('produces a summary combining profile and tactic reasons', () => {
    const formatter = new RationaleFormatter();
    const result = formatter.format(makeRationale());

    expect(result.summary).toContain('Profile cloud_reasoning');
    expect(result.summary).toContain('Tactic single_pass');
    expect(result.summary).toContain('|');
  });

  it('includes all detail fields', () => {
    const formatter = new RationaleFormatter();
    const result = formatter.format(makeRationale());

    expect(result.details.profile).toContain('Profile');
    expect(result.details.tactic).toContain('Tactic');
    expect(result.details.provider).toContain('Provider');
    expect(result.details.policy).toContain('Privacy');
    expect(result.details.constraints).toContain('Structured');
    expect(result.details.eligibleProfiles).toBe('3');
    expect(result.details.eligibleTactics).toBe('2');
  });

  it('handles zero counts', () => {
    const formatter = new RationaleFormatter();
    const result = formatter.format(makeRationale({
      eligibleProfileCount: 0,
      eligibleTacticCount: 0,
    }));

    expect(result.details.eligibleProfiles).toBe('0');
    expect(result.details.eligibleTactics).toBe('0');
  });
});
