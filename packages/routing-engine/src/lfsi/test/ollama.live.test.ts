// LFSI Live Test — Real Ollama HTTP API
// Requires Ollama running at localhost:11434
// NO MOCKS. NO STUBS. Real provider execution.

import { describe, it, expect, beforeAll } from 'vitest';
import { OllamaInferenceProvider } from '../providers/ollama.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', '..', 'fixtures');

let provider: OllamaInferenceProvider;
let available: boolean;

beforeAll(async () => {
  provider = new OllamaInferenceProvider();
  available = await provider.isAvailable();
});

function makeRequest(capability: string, text: string) {
  return {
    taskId: `ollama-test-${Date.now()}`,
    capability,
    sourceSystem: 'lfsi-test',
    surface: 'macos' as const,
    input: { text },
    context: { sensitivity: 'private' as const, requiresNetwork: false, requiresCurrentWeb: false },
    policyProfile: 'lfsi.local_balanced' as const,
  };
}

describe('Ollama Provider — Live', () => {
  it('reports availability when Ollama is running', () => {
    expect(typeof available).toBe('boolean');
    if (!available) {
      console.warn('[lfsi-ollama-live] Ollama not available at localhost:11434 — skipping live tests');
    }
  });

  it('summarizes text', async () => {
    if (!available) return;
    const text = readFileSync(join(fixturesDir, 'summarize-short.txt'), 'utf-8');
    const result = await provider.invoke(makeRequest('text.summarize', text));

    expect(result.providerId).toBe('ollama.default');
    expect(result.tier).toBe('tier1');
    expect(result.rawText).toBeTruthy();
    expect(result.rawText!.length).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThan(0);
  }, 60_000);

  it('performs structured extraction', async () => {
    if (!available) return;
    const text = readFileSync(join(fixturesDir, 'extract-person.txt'), 'utf-8');
    const result = await provider.invoke(makeRequest('text.extract.structured', text));

    expect(result.providerId).toBe('ollama.default');
    expect(result.rawText).toBeTruthy();
    expect(result.rawText!.length).toBeGreaterThan(0);
  }, 60_000);

  it('performs deep reasoning', async () => {
    if (!available) return;
    const result = await provider.invoke(makeRequest(
      'reasoning.deep',
      'A farmer has 17 sheep. All but 9 run away. How many sheep does the farmer have left? Explain your reasoning.',
    ));

    expect(result.providerId).toBe('ollama.default');
    expect(result.tier).toBe('tier1');
    expect(result.rawText).toBeTruthy();
    expect(result.rawText!.length).toBeGreaterThan(10);
  }, 120_000);

  it('has tier1 capabilities but not tier0-only', () => {
    expect(provider.capabilities).toContain('text.summarize');
    expect(provider.capabilities).toContain('reasoning.deep');
    expect(provider.capabilities).toContain('code.assist.basic');
    // Should NOT have Apple-only capabilities
    expect(provider.capabilities).not.toContain('speech.tts');
    expect(provider.capabilities).not.toContain('speech.stt');
  });

  it('does not support speech capabilities', async () => {
    if (!available) return;
    await expect(provider.invoke(makeRequest('speech.tts', 'hello')))
      .rejects.toThrow('does not support');
  });
});
