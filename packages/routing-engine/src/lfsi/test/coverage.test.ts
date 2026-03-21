import { describe, it, expect, beforeEach } from 'vitest';
import { validateResult } from '../validator.js';
import {
  isKnownCapability,
  getCapability,
  getCapabilitiesForTier,
  getAllCapabilityIds,
} from '../capabilities.js';
import type { LfsiCapability } from '../capabilities.js';
import { LfsiError, LFSI_REASON } from '../errors.js';
import type { LfsiReasonCode } from '../errors.js';
import { resolvePolicy } from '../policies.js';
import type { PolicyResolution } from '../policies.js';
import { InMemoryLedgerSink, buildLedgerEvent } from '../ledger.js';
import type {
  InferenceResult,
  ValidationResult,
  LedgerEvent,
  InferenceRequest,
  InferenceProvider,
  LfsiTier,
  LfsiPolicy,
  LfsiSurface,
  LedgerOutcome,
} from '../types.js';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<InferenceResult> = {}): InferenceResult {
  return {
    providerId: 'test',
    tier: 'tier0',
    output: {},
    latencyMs: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validator.ts
// ---------------------------------------------------------------------------

describe('validator — text.summarize', () => {
  it('fails with empty_summary when output is empty string', () => {
    const r = validateResult('text.summarize', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_summary');
    expect(r.confidence).toBe(0.3);
    expect(r.nextAction).toBe('escalate');
  });

  it('fails with empty_summary when rawText is undefined and output.text missing', () => {
    const r = validateResult('text.summarize', makeResult());
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_summary');
  });

  it('fails with summary_too_short when output < 10 chars', () => {
    const r = validateResult('text.summarize', makeResult({ rawText: 'Short' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('summary_too_short');
  });

  it('passes when output >= 10 chars', () => {
    const r = validateResult('text.summarize', makeResult({ rawText: 'This is a valid summary output.' }));
    expect(r.passed).toBe(true);
    expect(r.failures).toHaveLength(0);
    expect(r.confidence).toBe(0.9);
    expect(r.nextAction).toBe('return');
  });

  it('fails with empty_summary when rawText is only whitespace', () => {
    const r = validateResult('text.summarize', makeResult({ rawText: '   \n\t  ' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_summary');
  });
});

describe('validator — text.rewrite', () => {
  it('fails with empty_rewrite when empty', () => {
    const r = validateResult('text.rewrite', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_rewrite');
  });

  it('passes when valid', () => {
    const r = validateResult('text.rewrite', makeResult({ rawText: 'Rewritten text here.' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — text.extract.structured', () => {
  it('fails with empty_extraction when empty', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_extraction');
  });

  it('fails with extraction_invalid_json for invalid JSON', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: 'not json {{{' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('extraction_invalid_json');
  });

  it('fails with extraction_not_object for non-object JSON like string', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: '"hello"' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('extraction_not_object');
  });

  it('fails with extraction_not_object for JSON number', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: '42' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('extraction_not_object');
  });

  it('fails with extraction_not_object for JSON null', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: 'null' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('extraction_not_object');
  });

  it('passes for valid JSON object', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: '{"key":"value"}' }));
    expect(r.passed).toBe(true);
  });

  it('passes for JSON array (arrays are typeof object and not null)', () => {
    const r = validateResult('text.extract.structured', makeResult({ rawText: '[1,2,3]' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — reasoning.deep', () => {
  it('fails with empty_reasoning when empty', () => {
    const r = validateResult('reasoning.deep', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_reasoning');
  });

  it('passes with valid reasoning', () => {
    const r = validateResult('reasoning.deep', makeResult({ rawText: 'Step 1: Consider the problem...' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — reasoning.light', () => {
  it('fails with empty_reasoning when empty', () => {
    const r = validateResult('reasoning.light', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_reasoning');
  });

  it('passes with valid reasoning', () => {
    const r = validateResult('reasoning.light', makeResult({ rawText: 'Quick analysis...' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — speech.tts', () => {
  it('fails with tts_no_confirmation when no text, no status, no audioData', () => {
    const r = validateResult('speech.tts', makeResult({ output: {} }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('tts_no_confirmation');
  });

  it('passes when output.status is set', () => {
    const r = validateResult('speech.tts', makeResult({ output: { status: 'completed' } }));
    expect(r.passed).toBe(true);
  });

  it('passes when rawText is set', () => {
    const r = validateResult('speech.tts', makeResult({ rawText: 'spoken' }));
    expect(r.passed).toBe(true);
  });

  it('passes when output.audioData is set', () => {
    const r = validateResult('speech.tts', makeResult({ output: { audioData: 'base64data' } }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — speech.stt', () => {
  it('fails with empty_transcript when empty', () => {
    const r = validateResult('speech.stt', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_transcript');
  });

  it('passes with valid transcript', () => {
    const r = validateResult('speech.stt', makeResult({ rawText: 'Hello world transcript.' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — intent.classify', () => {
  it('fails with empty_output when empty', () => {
    const r = validateResult('intent.classify', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_output');
  });

  it('passes with valid classification', () => {
    const r = validateResult('intent.classify', makeResult({ rawText: 'greeting' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — text.generate.short', () => {
  it('fails with empty_output when empty', () => {
    const r = validateResult('text.generate.short', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_output');
  });

  it('passes with valid output', () => {
    const r = validateResult('text.generate.short', makeResult({ rawText: 'Generated text.' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — text.generate.long', () => {
  it('fails with empty_output when empty', () => {
    const r = validateResult('text.generate.long', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_output');
  });

  it('passes with valid output', () => {
    const r = validateResult('text.generate.long', makeResult({ rawText: 'A long generated passage.' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — code.assist.basic', () => {
  it('fails with empty_output when empty', () => {
    const r = validateResult('code.assist.basic', makeResult({ rawText: '' }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_output');
  });

  it('passes with valid output', () => {
    const r = validateResult('code.assist.basic', makeResult({ rawText: 'function foo() {}' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — unknown capability', () => {
  it('passes validation (validator does not reject unknowns)', () => {
    const r = validateResult('totally.fake.cap', makeResult({ rawText: '' }));
    expect(r.passed).toBe(true);
  });
});

describe('validator — text source resolution', () => {
  it('uses rawText when set', () => {
    const r = validateResult('text.summarize', makeResult({ rawText: 'A valid summary text here.' }));
    expect(r.passed).toBe(true);
  });

  it('falls back to output.text when rawText is undefined', () => {
    const r = validateResult('text.summarize', makeResult({
      output: { text: 'A valid summary from output.text.' },
    }));
    expect(r.passed).toBe(true);
  });

  it('uses empty string when output.text is not a string', () => {
    const r = validateResult('text.summarize', makeResult({
      output: { text: 12345 },
    }));
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_summary');
  });
});

// ---------------------------------------------------------------------------
// capabilities.ts
// ---------------------------------------------------------------------------

describe('capabilities — isKnownCapability', () => {
  const ALL = [
    'text.summarize', 'text.rewrite', 'text.extract.structured',
    'speech.tts', 'speech.stt', 'intent.classify', 'text.generate.short',
    'reasoning.light', 'reasoning.deep', 'text.generate.long',
    'code.assist.basic', 'research.web',
  ];

  it.each(ALL)('returns true for registered capability: %s', (cap) => {
    expect(isKnownCapability(cap)).toBe(true);
  });

  it('returns false for unknown capability', () => {
    expect(isKnownCapability('image.generate')).toBe(false);
  });
});

describe('capabilities — getCapability', () => {
  it('returns correct entry for text.summarize', () => {
    const cap = getCapability('text.summarize');
    expect(cap).toBeDefined();
    expect(cap!.id).toBe('text.summarize');
    expect(cap!.tiers).toContain('tier0');
    expect(cap!.tiers).toContain('tier1');
    expect(cap!.appleMethod).toBe('foundation_models.summarize');
    expect(cap!.ollamaModel).toBe('qwen3:8b');
  });

  it('returns correct entry for speech.tts (tier0 only, no ollamaModel)', () => {
    const cap = getCapability('speech.tts');
    expect(cap).toBeDefined();
    expect(cap!.tiers).toEqual(['tier0']);
    expect(cap!.appleMethod).toBe('tts.speak');
    expect(cap!.ollamaModel).toBeUndefined();
  });

  it('returns correct entry for reasoning.deep (tier1 only, no appleMethod)', () => {
    const cap = getCapability('reasoning.deep');
    expect(cap).toBeDefined();
    expect(cap!.tiers).toEqual(['tier1']);
    expect(cap!.ollamaModel).toBe('qwen3:8b');
    expect(cap!.appleMethod).toBeUndefined();
  });

  it('returns correct entry for text.extract.structured (has responseFormat json)', () => {
    const cap = getCapability('text.extract.structured');
    expect(cap).toBeDefined();
    expect(cap!.responseFormat).toBe('json');
  });

  it('returns correct entry for research.web (tier2, no methods)', () => {
    const cap = getCapability('research.web');
    expect(cap).toBeDefined();
    expect(cap!.tiers).toEqual(['tier2']);
    expect(cap!.appleMethod).toBeUndefined();
    expect(cap!.ollamaModel).toBeUndefined();
  });

  it('returns undefined for unknown capability', () => {
    expect(getCapability('image.generate')).toBeUndefined();
  });
});

describe('capabilities — getCapabilitiesForTier', () => {
  it('tier0 returns Apple capabilities', () => {
    const caps = getCapabilitiesForTier('tier0');
    const ids = caps.map(c => c.id);
    expect(ids).toContain('text.summarize');
    expect(ids).toContain('text.rewrite');
    expect(ids).toContain('text.extract.structured');
    expect(ids).toContain('speech.tts');
    expect(ids).toContain('speech.stt');
    expect(ids).toContain('intent.classify');
    expect(ids).toContain('text.generate.short');
    expect(ids).toContain('reasoning.light');
    // tier1-only caps should NOT be here
    expect(ids).not.toContain('reasoning.deep');
    expect(ids).not.toContain('text.generate.long');
    expect(ids).not.toContain('code.assist.basic');
  });

  it('tier1 returns Ollama capabilities', () => {
    const caps = getCapabilitiesForTier('tier1');
    const ids = caps.map(c => c.id);
    expect(ids).toContain('text.summarize');
    expect(ids).toContain('text.rewrite');
    expect(ids).toContain('text.extract.structured');
    expect(ids).toContain('reasoning.deep');
    expect(ids).toContain('text.generate.long');
    expect(ids).toContain('code.assist.basic');
    expect(ids).toContain('text.generate.short');
    // tier0-only caps should NOT be here
    expect(ids).not.toContain('speech.tts');
    expect(ids).not.toContain('speech.stt');
  });

  it('tier2 returns only research.web', () => {
    const caps = getCapabilitiesForTier('tier2');
    expect(caps).toHaveLength(1);
    expect(caps[0].id).toBe('research.web');
  });
});

describe('capabilities — getAllCapabilityIds', () => {
  it('returns all registered capability IDs', () => {
    const ids = getAllCapabilityIds();
    expect(ids).toHaveLength(12);
    expect(ids).toContain('text.summarize');
    expect(ids).toContain('research.web');
    expect(ids).toContain('code.assist.basic');
  });
});

describe('capabilities — each capability has correct assignments', () => {
  it('text.rewrite has both appleMethod and ollamaModel', () => {
    const cap = getCapability('text.rewrite')!;
    expect(cap.appleMethod).toBe('writing_tools.rewrite');
    expect(cap.ollamaModel).toBe('qwen3:8b');
  });

  it('speech.stt has appleMethod only', () => {
    const cap = getCapability('speech.stt')!;
    expect(cap.appleMethod).toBe('speech.transcribe_file');
    expect(cap.ollamaModel).toBeUndefined();
  });

  it('intent.classify has appleMethod and systemPrompt', () => {
    const cap = getCapability('intent.classify')!;
    expect(cap.appleMethod).toBe('foundation_models.generate');
    expect(cap.systemPrompt).toBeDefined();
  });

  it('reasoning.light has appleMethod and systemPrompt', () => {
    const cap = getCapability('reasoning.light')!;
    expect(cap.appleMethod).toBe('foundation_models.generate');
    expect(cap.systemPrompt).toBeDefined();
  });

  it('code.assist.basic has ollamaModel and systemPrompt', () => {
    const cap = getCapability('code.assist.basic')!;
    expect(cap.ollamaModel).toBe('qwen3:8b');
    expect(cap.systemPrompt).toBeDefined();
  });

  it('text.generate.short has both methods but no systemPrompt', () => {
    const cap = getCapability('text.generate.short')!;
    expect(cap.appleMethod).toBe('foundation_models.generate');
    expect(cap.ollamaModel).toBe('qwen3:8b');
    expect(cap.systemPrompt).toBeUndefined();
  });

  it('text.generate.long has ollamaModel only, no systemPrompt', () => {
    const cap = getCapability('text.generate.long')!;
    expect(cap.ollamaModel).toBe('qwen3:8b');
    expect(cap.appleMethod).toBeUndefined();
    expect(cap.systemPrompt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// errors.ts
// ---------------------------------------------------------------------------

describe('errors — LfsiError', () => {
  it('has correct name, reasonCode, and message', () => {
    const err = new LfsiError(LFSI_REASON.UNKNOWN_CAPABILITY, 'test msg');
    expect(err.name).toBe('LfsiError');
    expect(err.reasonCode).toBe('UNKNOWN_CAPABILITY');
    expect(err.message).toBe('test msg');
  });

  it('is instanceof Error', () => {
    const err = new LfsiError(LFSI_REASON.NO_PROVIDER_AVAILABLE, 'no provider');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LfsiError);
  });
});

describe('errors — LFSI_REASON constants', () => {
  it('has all 8 reason codes as string constants', () => {
    expect(LFSI_REASON.UNKNOWN_CAPABILITY).toBe('UNKNOWN_CAPABILITY');
    expect(LFSI_REASON.CLIENT_PROVIDER_OVERRIDE_FORBIDDEN).toBe('CLIENT_PROVIDER_OVERRIDE_FORBIDDEN');
    expect(LFSI_REASON.APPLE_PROVIDER_UNAVAILABLE).toBe('APPLE_PROVIDER_UNAVAILABLE');
    expect(LFSI_REASON.APPLE_ONLY_VALIDATION_FAILURE).toBe('APPLE_ONLY_VALIDATION_FAILURE');
    expect(LFSI_REASON.NO_PROVIDER_AVAILABLE).toBe('NO_PROVIDER_AVAILABLE');
    expect(LFSI_REASON.VALIDATION_FAILED_NO_ESCALATION).toBe('VALIDATION_FAILED_NO_ESCALATION');
    expect(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT).toBe('WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT');
    expect(LFSI_REASON.CURRENT_WEB_FORBIDDEN_UNDER_PRIVATE_STRICT).toBe('CURRENT_WEB_FORBIDDEN_UNDER_PRIVATE_STRICT');
    expect(Object.keys(LFSI_REASON)).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// types.ts — compile-time verification
// ---------------------------------------------------------------------------

describe('types — exports compile correctly', () => {
  it('LfsiTier accepts valid values', () => {
    const t0: LfsiTier = 'tier0';
    const t1: LfsiTier = 'tier1';
    const t2: LfsiTier = 'tier2';
    expect([t0, t1, t2]).toEqual(['tier0', 'tier1', 'tier2']);
  });

  it('LfsiPolicy accepts valid values', () => {
    const p1: LfsiPolicy = 'lfsi.local_balanced';
    const p2: LfsiPolicy = 'lfsi.apple_only';
    const p3: LfsiPolicy = 'lfsi.private_strict';
    expect([p1, p2, p3]).toHaveLength(3);
  });

  it('LfsiSurface accepts valid values', () => {
    const surfaces: LfsiSurface[] = ['macos', 'ios', 'server', 'cli', 'web'];
    expect(surfaces).toHaveLength(5);
  });

  it('LedgerOutcome accepts valid values', () => {
    const outcomes: LedgerOutcome[] = ['success', 'failure', 'denied'];
    expect(outcomes).toHaveLength(3);
  });

  it('InferenceRequest shape compiles', () => {
    const req: InferenceRequest = {
      taskId: 't1',
      capability: 'text.summarize',
      sourceSystem: 'test',
      surface: 'macos',
      input: { text: 'hello' },
      context: { sensitivity: 'public', requiresNetwork: false, requiresCurrentWeb: false },
      policyProfile: 'lfsi.local_balanced',
    };
    expect(req.taskId).toBe('t1');
  });

  it('InferenceResult shape compiles', () => {
    const result: InferenceResult = {
      providerId: 'test',
      tier: 'tier0',
      output: {},
      latencyMs: 10,
    };
    expect(result.providerId).toBe('test');
  });

  it('ValidationResult shape compiles', () => {
    const vr: ValidationResult = { passed: true, confidence: 0.9, failures: [], nextAction: 'return' };
    expect(vr.passed).toBe(true);
  });

  it('LedgerEvent shape compiles', () => {
    const evt: LedgerEvent = {
      eventId: 'e1',
      timestamp: new Date().toISOString(),
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: true,
      escalated: false,
      finalProvider: 'apple',
      latencyMs: 10,
      resultStatus: 'success',
      attempts: 1,
    };
    expect(evt.eventId).toBe('e1');
  });

  it('InferenceProvider shape compiles', () => {
    const provider: InferenceProvider = {
      id: 'test',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      local: true,
      isAvailable: async () => true,
      invoke: async () => makeResult(),
    };
    expect(provider.id).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// policies.ts
// ---------------------------------------------------------------------------

describe('policies — resolvePolicy', () => {
  it('resolves lfsi.local_balanced with correct shape', () => {
    const p = resolvePolicy('lfsi.local_balanced', 'text.summarize');
    expect(p.allowedTiers).toContain('tier0');
    expect(p.allowedTiers).toContain('tier1');
    expect(p.allowEscalation).toBe(true);
    expect(p.deniedCapabilities).toHaveLength(0);
  });

  it('resolves lfsi.apple_only with tier0 only and no escalation', () => {
    const p = resolvePolicy('lfsi.apple_only', 'text.summarize');
    expect(p.allowedTiers).toEqual(['tier0']);
    expect(p.allowEscalation).toBe(false);
  });

  it('resolves lfsi.private_strict with research.web denied', () => {
    const p = resolvePolicy('lfsi.private_strict', 'text.summarize');
    expect(p.deniedCapabilities).toContain('research.web');
    expect(p.allowEscalation).toBe(true);
  });

  it('throws WEB_RESEARCH_NOT_ALLOWED for research.web under private_strict', () => {
    expect(() => resolvePolicy('lfsi.private_strict', 'research.web'))
      .toThrow(LfsiError);
    try {
      resolvePolicy('lfsi.private_strict', 'research.web');
    } catch (e) {
      expect(e).toBeInstanceOf(LfsiError);
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT);
    }
  });

  it('does NOT throw for research.web under local_balanced', () => {
    const p = resolvePolicy('lfsi.local_balanced', 'research.web');
    expect(p.allowedTiers).toContain('tier0');
  });
});

// ---------------------------------------------------------------------------
// ledger.ts
// ---------------------------------------------------------------------------

describe('ledger — InMemoryLedgerSink', () => {
  let ledger: InMemoryLedgerSink;

  beforeEach(() => {
    ledger = new InMemoryLedgerSink();
  });

  it('starts empty', () => {
    expect(ledger.size).toBe(0);
    expect(ledger.getAll()).toHaveLength(0);
  });

  it('writes and retrieves events', () => {
    const evt = buildLedgerEvent({
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: true,
      escalated: false,
      finalProvider: 'apple',
      latencyMs: 10,
      resultStatus: 'success',
      attempts: 1,
    });
    ledger.write(evt);
    expect(ledger.size).toBe(1);
    expect(ledger.getAll()[0].taskId).toBe('t1');
  });

  it('getByTaskId returns correct event', () => {
    const evt = buildLedgerEvent({
      taskId: 'lookup-me',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: true,
      escalated: false,
      finalProvider: 'apple',
      latencyMs: 5,
      resultStatus: 'success',
      attempts: 1,
    });
    ledger.write(evt);
    expect(ledger.getByTaskId('lookup-me')).toBeDefined();
    expect(ledger.getByTaskId('nonexistent')).toBeUndefined();
  });

  it('clear removes all events', () => {
    ledger.write(buildLedgerEvent({
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: true,
      escalated: false,
      finalProvider: 'apple',
      latencyMs: 5,
      resultStatus: 'success',
      attempts: 1,
    }));
    expect(ledger.size).toBe(1);
    ledger.clear();
    expect(ledger.size).toBe(0);
  });
});

describe('ledger — buildLedgerEvent', () => {
  it('generates valid UUID for eventId', () => {
    const evt = buildLedgerEvent({
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: true,
      escalated: false,
      finalProvider: 'apple',
      latencyMs: 10,
      resultStatus: 'success',
      attempts: 1,
    });
    // UUID v4 pattern
    expect(evt.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates ISO timestamp', () => {
    const evt = buildLedgerEvent({
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: true,
      escalated: false,
      finalProvider: 'apple',
      latencyMs: 10,
      resultStatus: 'success',
      attempts: 1,
    });
    expect(new Date(evt.timestamp).toISOString()).toBe(evt.timestamp);
  });

  it('includes escalatedTo when provided', () => {
    const evt = buildLedgerEvent({
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'apple',
      validationPassed: false,
      escalated: true,
      escalatedTo: 'ollama',
      finalProvider: 'ollama',
      latencyMs: 20,
      resultStatus: 'success',
      attempts: 2,
    });
    expect(evt.escalatedTo).toBe('ollama');
  });

  it('includes reasonCode when provided', () => {
    const evt = buildLedgerEvent({
      taskId: 't1',
      sourceSystem: 'test',
      capability: 'unknown.cap',
      policyProfile: 'lfsi.local_balanced',
      selectedTier: 'tier0',
      selectedProvider: 'none',
      validationPassed: false,
      escalated: false,
      finalProvider: 'none',
      latencyMs: 1,
      resultStatus: 'failure',
      reasonCode: LFSI_REASON.UNKNOWN_CAPABILITY,
      attempts: 0,
    });
    expect(evt.reasonCode).toBe('UNKNOWN_CAPABILITY');
  });
});
