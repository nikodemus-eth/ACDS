// LFSI Live Test — Full Router Integration
// Uses real Apple bridge + real Ollama — NO MOCKS
// Spec reference: Section 15D (Router live tests)

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { LfsiRouter } from '../router.js';
import { InMemoryLedgerSink } from '../ledger.js';
import { AppleInferenceProvider } from '../providers/apple.js';
import { OllamaInferenceProvider } from '../providers/ollama.js';
import { LfsiError, LFSI_REASON } from '../errors.js';
import type { InferenceRequest } from '../types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', 'fixtures');

let apple: AppleInferenceProvider;
let ollama: OllamaInferenceProvider;
let appleAvailable: boolean;
let ollamaAvailable: boolean;
let ledger: InMemoryLedgerSink;
let router: LfsiRouter;

beforeAll(async () => {
  apple = new AppleInferenceProvider();
  ollama = new OllamaInferenceProvider();
  appleAvailable = await apple.isAvailable();
  ollamaAvailable = await ollama.isAvailable();
});

beforeEach(() => {
  ledger = new InMemoryLedgerSink();
  router = new LfsiRouter({
    providers: [apple, ollama],
    ledger,
  });
});

function makeRequest(overrides: Partial<InferenceRequest> = {}): InferenceRequest {
  return {
    taskId: `router-test-${Date.now()}`,
    capability: 'text.summarize',
    sourceSystem: 'lfsi-test',
    surface: 'macos',
    input: { text: readFileSync(join(fixturesDir, 'summarize-short.txt'), 'utf-8') },
    context: { sensitivity: 'private', requiresNetwork: false, requiresCurrentWeb: false },
    policyProfile: 'lfsi.local_balanced',
    ...overrides,
  };
}

describe('LFSI Router — Live Integration', () => {
  it('routes text.summarize to Apple first under local_balanced', async () => {
    if (!appleAvailable) return;
    const result = await router.route(makeRequest());

    expect(result.providerId).toBe('apple.foundation');
    expect(result.tier).toBe('tier0');
    expect(result.rawText).toBeTruthy();
    expect(result.latencyMs).toBeGreaterThan(0);

    // Ledger written
    expect(ledger.size).toBe(1);
    const event = ledger.getAll()[0];
    expect(event.resultStatus).toBe('success');
    expect(event.selectedProvider).toBe('apple.foundation');
    expect(event.escalated).toBe(false);
  }, 30_000);

  it('routes reasoning.deep to Ollama (tier1 only capability)', async () => {
    if (!ollamaAvailable) return;
    const result = await router.route(makeRequest({
      capability: 'reasoning.deep',
      input: { text: 'What is 17 minus 8? Show your work.' },
    }));

    expect(result.providerId).toBe('ollama.default');
    expect(result.tier).toBe('tier1');
    expect(result.rawText).toBeTruthy();

    expect(ledger.size).toBe(1);
    expect(ledger.getAll()[0].capability).toBe('reasoning.deep');
  }, 120_000);

  it('rejects unknown capability', async () => {
    try {
      await router.route(makeRequest({ capability: 'bogus.nonexistent' }));
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LfsiError);
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.UNKNOWN_CAPABILITY);
    }

    // Ledger still written on error
    expect(ledger.size).toBe(1);
    expect(ledger.getAll()[0].resultStatus).toBe('failure');
  });

  it('rejects provider override attempts', async () => {
    try {
      await router.route(makeRequest({ hasProviderOverride: true }));
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LfsiError);
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.CLIENT_PROVIDER_OVERRIDE_FORBIDDEN);
    }

    expect(ledger.size).toBe(1);
    expect(ledger.getAll()[0].reasonCode).toBe(LFSI_REASON.CLIENT_PROVIDER_OVERRIDE_FORBIDDEN);
  });

  it('denies research.web under private_strict', async () => {
    try {
      await router.route(makeRequest({
        capability: 'research.web',
        policyProfile: 'lfsi.private_strict',
      }));
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LfsiError);
      expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT);
    }

    expect(ledger.size).toBe(1);
    expect(ledger.getAll()[0].resultStatus).toBe('denied');
  });

  it('writes ledger event with correct fields on success', async () => {
    if (!appleAvailable && !ollamaAvailable) return;
    await router.route(makeRequest());

    const event = ledger.getAll()[0];
    expect(event.taskId).toMatch(/^router-test-/);
    expect(event.sourceSystem).toBe('lfsi-test');
    expect(event.capability).toBe('text.summarize');
    expect(event.policyProfile).toBe('lfsi.local_balanced');
    expect(event.validationPassed).toBe(true);
    expect(event.latencyMs).toBeGreaterThan(0);
    expect(event.attempts).toBeGreaterThanOrEqual(1);
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
  }, 30_000);

  it('routes structured extraction through the full pipeline', async () => {
    if (!appleAvailable && !ollamaAvailable) return;
    const text = readFileSync(join(fixturesDir, 'extract-person.txt'), 'utf-8');
    const result = await router.route(makeRequest({
      capability: 'text.extract.structured',
      input: { text },
    }));

    expect(result.rawText).toBeTruthy();
    expect(result.latencyMs).toBeGreaterThan(0);

    expect(ledger.size).toBe(1);
    expect(ledger.getAll()[0].capability).toBe('text.extract.structured');
  }, 60_000);
});
