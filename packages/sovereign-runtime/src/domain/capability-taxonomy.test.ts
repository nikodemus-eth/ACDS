import { describe, it, expect } from 'vitest';
import { CAPABILITY_IDS, CAPABILITY_CONTRACTS } from './capability-taxonomy.js';

describe('Capability Taxonomy', () => {
  it('CAPABILITY_IDS is frozen', () => {
    expect(Object.isFrozen(CAPABILITY_IDS)).toBe(true);
  });

  it('CAPABILITY_IDS contains expected text capabilities', () => {
    expect(CAPABILITY_IDS.TEXT_GENERATE).toBe('text.generate');
    expect(CAPABILITY_IDS.TEXT_SUMMARIZE).toBe('text.summarize');
    expect(CAPABILITY_IDS.TEXT_CLASSIFY).toBe('text.classify');
    expect(CAPABILITY_IDS.TEXT_EMBED).toBe('text.embed');
    expect(CAPABILITY_IDS.TEXT_EXTRACT).toBe('text.extract');
    expect(CAPABILITY_IDS.TEXT_REWRITE).toBe('text.rewrite');
    expect(CAPABILITY_IDS.TEXT_PROOFREAD).toBe('text.proofread');
  });

  it('CAPABILITY_IDS contains expected speech capabilities', () => {
    expect(CAPABILITY_IDS.SPEECH_TRANSCRIBE).toBe('speech.transcribe');
    expect(CAPABILITY_IDS.SPEECH_SYNTHESIZE).toBe('speech.synthesize');
  });

  it('CAPABILITY_IDS contains expected image capabilities', () => {
    expect(CAPABILITY_IDS.IMAGE_GENERATE).toBe('image.generate');
    expect(CAPABILITY_IDS.IMAGE_DESCRIBE).toBe('image.describe');
    expect(CAPABILITY_IDS.IMAGE_OCR).toBe('image.ocr');
  });

  it('CAPABILITY_IDS contains sound, translation, and control capabilities', () => {
    expect(CAPABILITY_IDS.SOUND_CLASSIFY).toBe('sound.classify');
    expect(CAPABILITY_IDS.TRANSLATION_TRANSLATE).toBe('translation.translate');
    expect(CAPABILITY_IDS.AGENT_CONTROL_DECIDE).toBe('agent.control.decide');
    expect(CAPABILITY_IDS.ROUTER_SCORE).toBe('router.score');
    expect(CAPABILITY_IDS.POLICY_EVALUATE).toBe('policy.evaluate');
    expect(CAPABILITY_IDS.RISK_ASSESS).toBe('risk.assess');
  });

  it('CAPABILITY_CONTRACTS has one contract per capability ID', () => {
    const idSet = new Set(Object.values(CAPABILITY_IDS));
    expect(CAPABILITY_CONTRACTS.length).toBe(idSet.size);
    for (const contract of CAPABILITY_CONTRACTS) {
      expect(idSet.has(contract.id as any)).toBe(true);
    }
  });

  it('every contract has version, category, input/output schema, and description', () => {
    for (const contract of CAPABILITY_CONTRACTS) {
      expect(contract.version).toBeTruthy();
      expect(contract.category).toBeTruthy();
      expect(contract.inputSchema).toBeDefined();
      expect(contract.outputSchema).toBeDefined();
      expect(contract.description).toBeTruthy();
      expect(typeof contract.deterministic).toBe('boolean');
    }
  });

  it('input schemas validate valid data', () => {
    const textGen = CAPABILITY_CONTRACTS.find(c => c.id === 'text.generate')!;
    expect(textGen.inputSchema.safeParse({ prompt: 'hello' }).success).toBe(true);
    expect(textGen.inputSchema.safeParse({ prompt: 'hello', maxTokens: 100 }).success).toBe(true);
    expect(textGen.inputSchema.safeParse({}).success).toBe(false);
  });

  it('output schemas validate valid data', () => {
    const textGen = CAPABILITY_CONTRACTS.find(c => c.id === 'text.generate')!;
    expect(textGen.outputSchema.safeParse({ text: 'hello', tokenCount: 5 }).success).toBe(true);
    expect(textGen.outputSchema.safeParse({}).success).toBe(false);
  });
});
