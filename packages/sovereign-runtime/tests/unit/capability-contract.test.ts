import { describe, it, expect } from 'vitest';
import { CAPABILITY_IDS, CAPABILITY_CONTRACTS } from '../../src/domain/capability-taxonomy.js';
import type { CapabilityContract } from '../../src/domain/capability-contract.js';

describe('CAPABILITY_IDS', () => {
  it('is frozen and cannot be mutated', () => {
    expect(Object.isFrozen(CAPABILITY_IDS)).toBe(true);
  });

  it('contains 18 canonical capability IDs', () => {
    expect(Object.keys(CAPABILITY_IDS)).toHaveLength(18);
  });

  it('follows dot-separated naming convention', () => {
    for (const id of Object.values(CAPABILITY_IDS)) {
      expect(id).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it('has unique values', () => {
    const values = Object.values(CAPABILITY_IDS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('CAPABILITY_CONTRACTS', () => {
  it('has one contract per capability ID', () => {
    expect(CAPABILITY_CONTRACTS).toHaveLength(18);
    const ids = CAPABILITY_CONTRACTS.map((c) => c.id);
    const capabilityIdValues = Object.values(CAPABILITY_IDS);
    for (const id of capabilityIdValues) {
      expect(ids).toContain(id);
    }
  });

  it('every contract has valid required fields', () => {
    for (const contract of CAPABILITY_CONTRACTS) {
      expect(contract.id).toBeTruthy();
      expect(contract.version).toBeTruthy();
      expect(contract.category).toBeTruthy();
      expect(contract.inputSchema).toBeDefined();
      expect(contract.outputSchema).toBeDefined();
      expect(typeof contract.deterministic).toBe('boolean');
      expect(contract.description.length).toBeGreaterThan(0);
    }
  });

  it('text.generate contract validates correct input', () => {
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.TEXT_GENERATE)!;
    const result = contract.inputSchema.safeParse({ prompt: 'hello' });
    expect(result.success).toBe(true);
  });

  it('text.generate contract rejects invalid input', () => {
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.TEXT_GENERATE)!;
    const result = contract.inputSchema.safeParse({ wrong: 123 });
    expect(result.success).toBe(false);
  });

  it('text.summarize contract validates correct input', () => {
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.TEXT_SUMMARIZE)!;
    const result = contract.inputSchema.safeParse({ text: 'some text to summarize' });
    expect(result.success).toBe(true);
  });

  it('speech.transcribe contract validates correct input', () => {
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.SPEECH_TRANSCRIBE)!;
    const result = contract.inputSchema.safeParse({ audioData: 'base64data', language: 'en' });
    expect(result.success).toBe(true);
  });

  it('image.generate contract validates correct input', () => {
    const contract = CAPABILITY_CONTRACTS.find((c) => c.id === CAPABILITY_IDS.IMAGE_GENERATE)!;
    const result = contract.inputSchema.safeParse({ prompt: 'a cat', style: 'watercolor' });
    expect(result.success).toBe(true);
  });

  it('contracts cover all categories', () => {
    const categories = new Set(CAPABILITY_CONTRACTS.map((c) => c.category));
    expect(categories).toContain('text');
    expect(categories).toContain('speech');
    expect(categories).toContain('image');
    expect(categories).toContain('sound');
    expect(categories).toContain('translation');
    expect(categories).toContain('control');
    expect(categories).toContain('governance');
  });
});
