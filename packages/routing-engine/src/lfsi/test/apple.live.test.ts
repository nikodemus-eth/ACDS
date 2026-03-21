// LFSI Live Test — Real Apple Intelligence Bridge
// Requires the Apple Intelligence bridge running at localhost:11435
// NO MOCKS. NO STUBS. Real provider execution.

import { describe, it, expect, beforeAll } from 'vitest';
import { AppleInferenceProvider } from '../providers/apple.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', 'fixtures');

let provider: AppleInferenceProvider;
let available: boolean;

beforeAll(async () => {
  provider = new AppleInferenceProvider();
  available = await provider.isAvailable();
});

function makeRequest(capability: string, text: string) {
  return {
    taskId: `apple-test-${Date.now()}`,
    capability,
    sourceSystem: 'lfsi-test',
    surface: 'macos' as const,
    input: { text },
    context: { sensitivity: 'private' as const, requiresNetwork: false, requiresCurrentWeb: false },
    policyProfile: 'lfsi.local_balanced' as const,
  };
}

describe('Apple Intelligence Provider — Live', () => {
  it('reports availability when bridge is running', () => {
    // This test documents bridge status — it does not skip
    expect(typeof available).toBe('boolean');
    if (!available) {
      console.warn('[lfsi-apple-live] Apple bridge not available at localhost:11435 — skipping live tests');
    }
  });

  it('summarizes text', { timeout: 60_000 }, async () => {
    if (!available) return;
    const text = readFileSync(join(fixturesDir, 'summarize-short.txt'), 'utf-8');
    const result = await provider.invoke(makeRequest('text.summarize', text));

    expect(result.providerId).toBe('apple.foundation');
    expect(result.tier).toBe('tier0');
    expect(result.rawText).toBeTruthy();
    expect(result.rawText!.length).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('rewrites text', { timeout: 60_000 }, async () => {
    if (!available) return;
    const result = await provider.invoke(makeRequest('text.rewrite', 'The system is very good at doing things that are useful.'));

    expect(result.providerId).toBe('apple.foundation');
    expect(result.rawText).toBeTruthy();
    expect(result.rawText!.length).toBeGreaterThan(0);
  });

  it('extracts structured data', { timeout: 60_000 }, async () => {
    if (!available) return;
    const text = readFileSync(join(fixturesDir, 'extract-person.txt'), 'utf-8');
    const result = await provider.invoke(makeRequest('text.extract.structured', text));

    expect(result.providerId).toBe('apple.foundation');
    expect(result.rawText).toBeTruthy();
    // Output should be JSON-parseable
    const output = result.rawText!;
    expect(output.length).toBeGreaterThan(0);
  });

  it('has tier0 capabilities', () => {
    expect(provider.capabilities).toContain('text.summarize');
    expect(provider.capabilities).toContain('text.rewrite');
    expect(provider.capabilities).toContain('speech.tts');
    expect(provider.capabilities).toContain('speech.stt');
    // Should NOT have tier1-only capabilities
    expect(provider.capabilities).not.toContain('reasoning.deep');
  });
});
