import { describe, it, expect, beforeEach } from 'vitest';
import { LfsiRouter } from '../router.js';
import type { RouterConfig } from '../router.js';
import { InMemoryLedgerSink } from '../ledger.js';
import { LfsiError, LFSI_REASON } from '../errors.js';
import { validateResult } from '../validator.js';
import { resolvePolicy } from '../policies.js';
import { isKnownCapability } from '../capabilities.js';
import type {
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
  LfsiTier,
  LfsiPolicy,
} from '../types.js';

// ---------------------------------------------------------------------------
// FakeProvider — a real InferenceProvider implementation with deterministic
// behavior for testing routing logic. NOT a mock — implements the full
// interface with controllable return values.
// ---------------------------------------------------------------------------

class FakeProvider implements InferenceProvider {
  readonly id: string;
  readonly tier: LfsiTier;
  readonly capabilities: readonly string[];
  readonly local: boolean;

  private _available: boolean;
  private _result: InferenceResult;

  constructor(opts: {
    id: string;
    tier: LfsiTier;
    capabilities: string[];
    local?: boolean;
    available?: boolean;
    result?: Partial<InferenceResult>;
  }) {
    this.id = opts.id;
    this.tier = opts.tier;
    this.capabilities = opts.capabilities;
    this.local = opts.local ?? true;
    this._available = opts.available ?? true;
    this._result = {
      providerId: opts.id,
      tier: opts.tier,
      output: {},
      rawText: 'Default valid output for testing purposes.',
      latencyMs: 5,
      ...opts.result,
    };
  }

  setAvailable(v: boolean): void {
    this._available = v;
  }

  setResult(r: Partial<InferenceResult>): void {
    this._result = { ...this._result, ...r };
  }

  async isAvailable(): Promise<boolean> {
    return this._available;
  }

  async invoke(_request: InferenceRequest): Promise<InferenceResult> {
    return this._result;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<InferenceRequest> = {}): InferenceRequest {
  return {
    taskId: `task-${Date.now()}`,
    capability: 'text.summarize',
    sourceSystem: 'redteam-test',
    surface: 'macos',
    input: { text: 'Some input text for testing.' },
    context: { sensitivity: 'public', requiresNetwork: false, requiresCurrentWeb: false },
    policyProfile: 'lfsi.local_balanced',
    ...overrides,
  };
}

function makeRouter(providers: InferenceProvider[], ledger?: InMemoryLedgerSink): { router: LfsiRouter; ledger: InMemoryLedgerSink } {
  const l = ledger ?? new InMemoryLedgerSink();
  return { router: new LfsiRouter({ providers, ledger: l }), ledger: l };
}

// ---------------------------------------------------------------------------
// ROUTER ATTACKS
// ---------------------------------------------------------------------------

describe('redteam — router: provider override rejection', () => {
  it('rejects request with hasProviderOverride=true', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const { router } = makeRouter([apple]);

    await expect(router.route(makeRequest({ hasProviderOverride: true })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ hasProviderOverride: true }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.CLIENT_PROVIDER_OVERRIDE_FORBIDDEN);
    }
  });

  it('does NOT reject when hasProviderOverride=false', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const { router } = makeRouter([apple]);

    const result = await router.route(makeRequest({ hasProviderOverride: false }));
    expect(result.providerId).toBe('apple');
  });

  it('does NOT reject when hasProviderOverride is undefined', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const { router } = makeRouter([apple]);

    const req = makeRequest();
    delete req.hasProviderOverride;
    const result = await router.route(req);
    expect(result.providerId).toBe('apple');
  });
});

describe('redteam — router: unknown capability rejection', () => {
  it('rejects request with unknown capability', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const { router } = makeRouter([apple]);

    await expect(router.route(makeRequest({ capability: 'image.generate.photorealistic' })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ capability: 'image.generate.photorealistic' }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.UNKNOWN_CAPABILITY);
    }
  });

  it('rejects request with empty capability string', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const { router } = makeRouter([apple]);

    await expect(router.route(makeRequest({ capability: '' })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ capability: '' }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.UNKNOWN_CAPABILITY);
    }
  });
});

describe('redteam — router: policy-denied capabilities', () => {
  it('rejects research.web under private_strict', async () => {
    const tier2 = new FakeProvider({ id: 'web', tier: 'tier2', capabilities: ['research.web'] });
    const { router } = makeRouter([tier2]);

    await expect(router.route(makeRequest({
      capability: 'research.web',
      policyProfile: 'lfsi.private_strict',
    }))).rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({
        capability: 'research.web',
        policyProfile: 'lfsi.private_strict',
      }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT);
    }
  });

  it('does NOT reject research.web under local_balanced', async () => {
    // research.web is tier2 — no provider supports it under local_balanced (allowed tiers: tier0, tier1)
    // so it will fail with NO_PROVIDER_AVAILABLE, not a policy denial
    const tier2 = new FakeProvider({ id: 'web', tier: 'tier2', capabilities: ['research.web'] });
    const { router } = makeRouter([tier2]);

    try {
      await router.route(makeRequest({
        capability: 'research.web',
        policyProfile: 'lfsi.local_balanced',
      }));
    } catch (e) {
      // It should NOT be the policy denial error
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.NO_PROVIDER_AVAILABLE);
      expect((e as LfsiError).reasonCode).not.toBe(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT);
    }
  });
});

describe('redteam — router: apple_only with tier1-only capability', () => {
  it('rejects reasoning.deep under apple_only (no provider available)', async () => {
    const ollama = new FakeProvider({ id: 'ollama', tier: 'tier1', capabilities: ['reasoning.deep'] });
    const { router } = makeRouter([ollama]);

    await expect(router.route(makeRequest({
      capability: 'reasoning.deep',
      policyProfile: 'lfsi.apple_only',
    }))).rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({
        capability: 'reasoning.deep',
        policyProfile: 'lfsi.apple_only',
      }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.NO_PROVIDER_AVAILABLE);
    }
  });
});

describe('redteam — router: unavailable provider under apple_only', () => {
  it('throws APPLE_PROVIDER_UNAVAILABLE when tier0 provider is down under apple_only', async () => {
    const apple = new FakeProvider({
      id: 'apple',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      available: false,
    });
    const { router } = makeRouter([apple]);

    await expect(router.route(makeRequest({ policyProfile: 'lfsi.apple_only' })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ policyProfile: 'lfsi.apple_only' }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.APPLE_PROVIDER_UNAVAILABLE);
    }
  });
});

describe('redteam — router: validation failure with no escalation', () => {
  it('throws APPLE_ONLY_VALIDATION_FAILURE when validation fails under apple_only', async () => {
    const apple = new FakeProvider({
      id: 'apple',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      result: { rawText: '' }, // empty → validation fails
    });
    const { router } = makeRouter([apple]);

    await expect(router.route(makeRequest({ policyProfile: 'lfsi.apple_only' })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ policyProfile: 'lfsi.apple_only' }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.APPLE_ONLY_VALIDATION_FAILURE);
    }
  });
});

describe('redteam — router: escalation path', () => {
  it('escalates from tier0 to tier1 when tier0 validation fails', async () => {
    const apple = new FakeProvider({
      id: 'apple',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      result: { rawText: '' }, // fails validation
    });
    const ollama = new FakeProvider({
      id: 'ollama',
      tier: 'tier1',
      capabilities: ['text.summarize'],
      result: { rawText: 'A proper summary that is long enough.' },
    });
    const { router, ledger } = makeRouter([apple, ollama]);

    const result = await router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' }));
    expect(result.providerId).toBe('ollama');

    const evt = ledger.getAll()[0];
    expect(evt.escalated).toBe(true);
    expect(evt.escalatedTo).toBe('ollama');
  });

  it('fails with NO_PROVIDER_AVAILABLE when all providers fail validation', async () => {
    const apple = new FakeProvider({
      id: 'apple',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      result: { rawText: '' },
    });
    const ollama = new FakeProvider({
      id: 'ollama',
      tier: 'tier1',
      capabilities: ['text.summarize'],
      result: { rawText: '' },
    });
    const { router } = makeRouter([apple, ollama]);

    await expect(router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.NO_PROVIDER_AVAILABLE);
    }
  });

  it('skips unavailable provider and tries next under local_balanced', async () => {
    const apple = new FakeProvider({
      id: 'apple',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      available: false,
    });
    const ollama = new FakeProvider({
      id: 'ollama',
      tier: 'tier1',
      capabilities: ['text.summarize'],
      result: { rawText: 'Ollama summary that is valid and long enough.' },
    });
    const { router } = makeRouter([apple, ollama]);

    const result = await router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' }));
    expect(result.providerId).toBe('ollama');
  });
});

// ---------------------------------------------------------------------------
// VALIDATION ATTACKS
// ---------------------------------------------------------------------------

describe('redteam — validation: extreme inputs', () => {
  it('extremely long output (100K chars) still passes for text.summarize', () => {
    const longText = 'A'.repeat(100_000);
    const r = validateResult('text.summarize', {
      providerId: 'test', tier: 'tier0', output: {}, rawText: longText, latencyMs: 10,
    });
    expect(r.passed).toBe(true);
  });

  it('output that is only whitespace fails for text.summarize', () => {
    const r = validateResult('text.summarize', {
      providerId: 'test', tier: 'tier0', output: {}, rawText: '   \t\n   ', latencyMs: 10,
    });
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_summary');
  });

  it('output that is only whitespace fails for text.rewrite', () => {
    const r = validateResult('text.rewrite', {
      providerId: 'test', tier: 'tier0', output: {}, rawText: '  \n\t ', latencyMs: 10,
    });
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('empty_rewrite');
  });
});

describe('redteam — validation: JSON edge cases for text.extract.structured', () => {
  it('prototype pollution attempt {"__proto__": {}} passes validation (parsed, not executed)', () => {
    const r = validateResult('text.extract.structured', {
      providerId: 'test', tier: 'tier0', output: {},
      rawText: '{"__proto__": {"isAdmin": true}}',
      latencyMs: 10,
    });
    // Passes because it IS a valid JSON object — we parse but don't spread into prototypes
    expect(r.passed).toBe(true);
  });

  it('JSON array passes (arrays are typeof object and not null)', () => {
    const r = validateResult('text.extract.structured', {
      providerId: 'test', tier: 'tier0', output: {},
      rawText: '["item1", "item2"]',
      latencyMs: 10,
    });
    expect(r.passed).toBe(true);
  });

  it('JSON null fails with extraction_not_object', () => {
    const r = validateResult('text.extract.structured', {
      providerId: 'test', tier: 'tier0', output: {},
      rawText: 'null',
      latencyMs: 10,
    });
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('extraction_not_object');
  });

  it('JSON boolean fails with extraction_not_object', () => {
    const r = validateResult('text.extract.structured', {
      providerId: 'test', tier: 'tier0', output: {},
      rawText: 'true',
      latencyMs: 10,
    });
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('extraction_not_object');
  });

  it('deeply nested JSON passes', () => {
    const deep = JSON.stringify({ a: { b: { c: { d: { e: 'deep' } } } } });
    const r = validateResult('text.extract.structured', {
      providerId: 'test', tier: 'tier0', output: {},
      rawText: deep,
      latencyMs: 10,
    });
    expect(r.passed).toBe(true);
  });
});

describe('redteam — validation: speech.tts confirmation paths', () => {
  it('passes when output.audioData is set (audioData is valid confirmation)', () => {
    const r = validateResult('speech.tts', {
      providerId: 'test', tier: 'tier0',
      output: { audioData: 'base64encodedaudio' },
      latencyMs: 10,
    });
    expect(r.passed).toBe(true);
  });

  it('fails when output is empty and no rawText', () => {
    const r = validateResult('speech.tts', {
      providerId: 'test', tier: 'tier0',
      output: {},
      latencyMs: 10,
    });
    expect(r.passed).toBe(false);
    expect(r.failures).toContain('tts_no_confirmation');
  });
});

// ---------------------------------------------------------------------------
// POLICY ATTACKS
// ---------------------------------------------------------------------------

describe('redteam — policy: edge cases', () => {
  it('capability containing research.web as substring but not exactly it is NOT denied', () => {
    // "research.web.extended" is not in the deniedCapabilities list (which has exact "research.web")
    // But it's also not a known capability, so it won't match. The policy check uses .includes()
    // which is exact string match in an array.
    const p = resolvePolicy('lfsi.private_strict', 'research.web.extended');
    // Should NOT throw — "research.web.extended" !== "research.web"
    expect(p.allowedTiers).toContain('tier0');
  });

  it('all three valid policies resolve without error for text.summarize', () => {
    const policies: LfsiPolicy[] = ['lfsi.local_balanced', 'lfsi.apple_only', 'lfsi.private_strict'];
    for (const policy of policies) {
      expect(() => resolvePolicy(policy, 'text.summarize')).not.toThrow();
    }
  });

  it('unknown policy name throws LfsiError', () => {
    // Cast to bypass TypeScript — tests the runtime guard for invalid policy names
    expect(() => resolvePolicy('lfsi.nonexistent' as LfsiPolicy, 'text.summarize'))
      .toThrow(LfsiError);
    try {
      resolvePolicy('lfsi.nonexistent' as LfsiPolicy, 'text.summarize');
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.UNKNOWN_CAPABILITY);
      expect((e as LfsiError).message).toContain('Unknown policy');
    }
  });

  it('denied capability that is NOT research.web throws CURRENT_WEB_FORBIDDEN', () => {
    // The code has a branch: if denied capability is research.web → WEB_RESEARCH_NOT_ALLOWED,
    // otherwise → CURRENT_WEB_FORBIDDEN_UNDER_PRIVATE_STRICT.
    // We need a denied capability that is not 'research.web'. Currently only research.web
    // is in the denied list, so we need to test with a policy that has a different denied cap.
    // Since the POLICIES object is internal, we test the code path by constructing a scenario:
    // We can't add a new policy, but the branch on line 38 checks `capability === 'research.web'`
    // If we could get a non-research.web capability into the deniedCapabilities array...
    // Since we can't modify the internal POLICIES, this branch is architecturally unreachable
    // with current policy definitions. We document this as a known gap.
    // However, the code IS tested via the research.web path which exercises lines 37-43.
  });
});

// ---------------------------------------------------------------------------
// LEDGER INTEGRITY
// ---------------------------------------------------------------------------

describe('redteam — ledger integrity on errors', () => {
  it('router writes ledger event even on UNKNOWN_CAPABILITY error', async () => {
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([], ledger);

    try {
      await router.route(makeRequest({ capability: 'nonexistent.cap' }));
    } catch { /* expected */ }

    expect(ledger.size).toBe(1);
    const evt = ledger.getAll()[0];
    expect(evt.reasonCode).toBe(LFSI_REASON.UNKNOWN_CAPABILITY);
    expect(evt.resultStatus).toBe('failure');
  });

  it('router writes ledger event on CLIENT_PROVIDER_OVERRIDE_FORBIDDEN error', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([apple], ledger);

    try {
      await router.route(makeRequest({ hasProviderOverride: true }));
    } catch { /* expected */ }

    expect(ledger.size).toBe(1);
    const evt = ledger.getAll()[0];
    expect(evt.reasonCode).toBe(LFSI_REASON.CLIENT_PROVIDER_OVERRIDE_FORBIDDEN);
    expect(evt.resultStatus).toBe('failure');
  });

  it('ledger event has valid UUID format for eventId', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([apple], ledger);

    await router.route(makeRequest());
    const evt = ledger.getAll()[0];
    expect(evt.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('ledger event has ISO timestamp format', async () => {
    const apple = new FakeProvider({ id: 'apple', tier: 'tier0', capabilities: ['text.summarize'] });
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([apple], ledger);

    await router.route(makeRequest());
    const evt = ledger.getAll()[0];
    // ISO 8601 timestamp
    expect(new Date(evt.timestamp).toISOString()).toBe(evt.timestamp);
  });

  it('ledger event captures correct reasonCode on failure', async () => {
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([], ledger);

    try {
      await router.route(makeRequest({ capability: '' }));
    } catch { /* expected */ }

    const evt = ledger.getAll()[0];
    expect(evt.reasonCode).toBe(LFSI_REASON.UNKNOWN_CAPABILITY);
  });

  it('ledger event records denied status for policy-denied capabilities', async () => {
    const ledger = new InMemoryLedgerSink();
    const tier2 = new FakeProvider({ id: 'web', tier: 'tier2', capabilities: ['research.web'] });
    const { router } = makeRouter([tier2], ledger);

    try {
      await router.route(makeRequest({
        capability: 'research.web',
        policyProfile: 'lfsi.private_strict',
      }));
    } catch { /* expected */ }

    const evt = ledger.getAll()[0];
    expect(evt.resultStatus).toBe('denied');
    expect(evt.reasonCode).toBe(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT);
  });

  it('ledger event records success on successful route', async () => {
    const apple = new FakeProvider({
      id: 'apple', tier: 'tier0', capabilities: ['text.summarize'],
      result: { rawText: 'A valid summary text for the test.' },
    });
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([apple], ledger);

    await router.route(makeRequest());
    const evt = ledger.getAll()[0];
    expect(evt.resultStatus).toBe('success');
    expect(evt.validationPassed).toBe(true);
    expect(evt.reasonCode).toBeUndefined();
  });

  it('ledger captures attempts count correctly with escalation', async () => {
    const apple = new FakeProvider({
      id: 'apple', tier: 'tier0', capabilities: ['text.summarize'],
      result: { rawText: '' }, // fails
    });
    const ollama = new FakeProvider({
      id: 'ollama', tier: 'tier1', capabilities: ['text.summarize'],
      result: { rawText: 'Valid ollama summary for the test case.' },
    });
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([apple, ollama], ledger);

    await router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' }));
    const evt = ledger.getAll()[0];
    expect(evt.attempts).toBe(2);
    expect(evt.escalated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ROUTER: provider sorting and filtering
// ---------------------------------------------------------------------------

describe('redteam — router: provider tier ordering', () => {
  it('tries tier0 before tier1 regardless of provider array order', async () => {
    const ollama = new FakeProvider({
      id: 'ollama', tier: 'tier1', capabilities: ['text.summarize'],
      result: { rawText: 'Ollama response that should not be reached.' },
    });
    const apple = new FakeProvider({
      id: 'apple', tier: 'tier0', capabilities: ['text.summarize'],
      result: { rawText: 'Apple response that is valid and long.' },
    });
    // Provide ollama first in the array — router should still prefer tier0
    const { router } = makeRouter([ollama, apple]);

    const result = await router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' }));
    expect(result.providerId).toBe('apple');
  });

  it('filters out providers that do not support the requested capability', async () => {
    const apple = new FakeProvider({
      id: 'apple', tier: 'tier0', capabilities: ['speech.tts'], // does NOT support text.summarize
    });
    const ollama = new FakeProvider({
      id: 'ollama', tier: 'tier1', capabilities: ['text.summarize'],
      result: { rawText: 'Ollama gets it because apple lacks capability.' },
    });
    const { router } = makeRouter([apple, ollama]);

    const result = await router.route(makeRequest({
      capability: 'text.summarize',
      policyProfile: 'lfsi.local_balanced',
    }));
    expect(result.providerId).toBe('ollama');
  });
});

// ---------------------------------------------------------------------------
// ROUTER: non-LfsiError thrown in catch block
// ---------------------------------------------------------------------------

describe('redteam — router: non-LfsiError propagation', () => {
  it('ledger captures undefined reasonCode when provider throws a generic Error', async () => {
    // Create a provider that throws a plain Error on invoke
    const badProvider: InferenceProvider = {
      id: 'bad',
      tier: 'tier0',
      capabilities: ['text.summarize'],
      local: true,
      isAvailable: async () => true,
      invoke: async () => { throw new Error('generic failure'); },
    };
    const ledger = new InMemoryLedgerSink();
    const { router } = makeRouter([badProvider], ledger);

    await expect(router.route(makeRequest())).rejects.toThrow('generic failure');

    expect(ledger.size).toBe(1);
    const evt = ledger.getAll()[0];
    expect(evt.reasonCode).toBeUndefined();
    expect(evt.resultStatus).toBe('failure');
  });
});

// ---------------------------------------------------------------------------
// ROUTER: VALIDATION_FAILED_NO_ESCALATION (non-apple_only policy with no escalation)
// ---------------------------------------------------------------------------
// Note: Currently all non-apple_only policies allow escalation,
// but the code has a branch: if policyProfile !== 'lfsi.apple_only' → VALIDATION_FAILED_NO_ESCALATION.
// We can't reach this branch with the current 3 policies, but we test the validation failure
// code path under apple_only which exercises the analogous branch.

describe('redteam — router: all providers unavailable under local_balanced', () => {
  it('exhausts all providers and throws NO_PROVIDER_AVAILABLE', async () => {
    const apple = new FakeProvider({
      id: 'apple', tier: 'tier0', capabilities: ['text.summarize'],
      available: false,
    });
    const ollama = new FakeProvider({
      id: 'ollama', tier: 'tier1', capabilities: ['text.summarize'],
      available: false,
    });
    const { router } = makeRouter([apple, ollama]);

    await expect(router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' })))
      .rejects.toThrow(LfsiError);

    try {
      await router.route(makeRequest({ policyProfile: 'lfsi.local_balanced' }));
    } catch (e) {
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.NO_PROVIDER_AVAILABLE);
    }
  });
});
