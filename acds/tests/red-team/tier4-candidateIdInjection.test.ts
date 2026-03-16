/**
 * ARGUS-9 Tier 4 — Candidate ID Injection
 *
 * Tests that buildCandidateId and parseCandidateId are vulnerable to
 * injection via colons in component IDs, empty segments, and special characters.
 */

import { describe, it, expect } from 'vitest';
import { buildCandidateId, parseCandidateId } from '@acds/adaptive-optimizer';

describe('ARGUS C5, F14: Candidate ID Injection', () => {

  it('accepts colons in modelProfileId — creates ambiguous composite', () => {
    // VULN: buildCandidateId doesn't validate components for colons
    const id = buildCandidateId('model:v2', 'tactic-1', 'provider-1');
    expect(id).toBe('model:v2:tactic-1:provider-1');
    // 4 parts instead of 3 → parseCandidateId will throw
    expect(() => parseCandidateId(id)).toThrow('Invalid candidateId');
  });

  it('accepts colons in tacticProfileId — breaks round-trip', () => {
    // VULN: no validation on tactic component
    const id = buildCandidateId('model-1', 'tactic:v1', 'provider-1');
    expect(id).toBe('model-1:tactic:v1:provider-1');
    expect(() => parseCandidateId(id)).toThrow('Invalid candidateId');
  });

  it('accepts colons in providerId — breaks round-trip', () => {
    // VULN: no validation on provider component
    const id = buildCandidateId('model-1', 'tactic-1', 'prov:1');
    expect(id).toBe('model-1:tactic-1:prov:1');
    expect(() => parseCandidateId(id)).toThrow('Invalid candidateId');
  });

  it('parseCandidateId throws on empty string', () => {
    // Edge case: empty candidateId
    expect(() => parseCandidateId('')).toThrow('Invalid candidateId');
  });

  it('parseCandidateId throws on two colons with empty segments (::)', () => {
    // Edge case: separator-only input
    expect(() => parseCandidateId('::')).toThrow('Invalid candidateId');
  });

  it('accepts empty strings in buildCandidateId — creates degenerate ID', () => {
    // VULN: no validation on empty component strings
    const id = buildCandidateId('', '', '');
    expect(id).toBe('::');
    // parseCandidateId rejects this (empty segments check)
    expect(() => parseCandidateId(id)).toThrow('Invalid candidateId');
  });

  it('accepts special characters in components — newlines, null bytes, unicode', () => {
    // VULN: no validation on character content
    const id = buildCandidateId('model\n1', 'tactic\0x', 'prov\u200B');
    // parseCandidateId accepts because it's 3 non-empty parts
    const parsed = parseCandidateId(id);
    expect(parsed.modelProfileId).toBe('model\n1');
    expect(parsed.tacticProfileId).toBe('tactic\0x');
  });

  it('accepts extremely long component IDs without limit', () => {
    // VULN: no length limit on candidateId components
    const longId = 'a'.repeat(100000);
    const id = buildCandidateId(longId, 'tactic', 'prov');
    const parsed = parseCandidateId(id);
    expect(parsed.modelProfileId.length).toBe(100000);
  });
});
