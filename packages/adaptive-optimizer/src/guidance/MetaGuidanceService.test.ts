import { describe, it, expect, beforeEach } from 'vitest';
import { MetaGuidanceService } from './MetaGuidanceService.js';
import type { PlateauSignal, PlateauIndicators } from '../plateau/PlateauSignal.js';

function makeIndicators(overrides: Partial<PlateauIndicators> = {}): PlateauIndicators {
  return {
    flatQuality: false,
    risingCost: false,
    risingCorrectionBurden: false,
    repeatedFallbacks: false,
    persistentUnderperformance: false,
    ...overrides,
  };
}

function makeSignal(
  severity: PlateauSignal['severity'],
  indicators: Partial<PlateauIndicators> = {},
): PlateauSignal {
  return {
    familyKey: 'fam:test',
    detected: severity !== 'none',
    severity,
    indicators: makeIndicators(indicators),
    detectedAt: new Date().toISOString(),
  };
}

describe('MetaGuidanceService', () => {
  let service: MetaGuidanceService;

  beforeEach(() => {
    service = new MetaGuidanceService();
  });

  it('returns empty array for severity "none"', () => {
    const result = service.generateStrategies('fam:test', makeSignal('none'));
    expect(result).toEqual([]);
  });

  it('returns empty array for severity "mild"', () => {
    const result = service.generateStrategies('fam:test', makeSignal('mild'));
    expect(result).toEqual([]);
  });

  it('returns empty array for moderate with no indicators set', () => {
    const result = service.generateStrategies('fam:test', makeSignal('moderate'));
    expect(result).toEqual([]);
  });

  it('generates change_scaffold and enable_multi_stage for flatQuality', () => {
    const result = service.generateStrategies('fam:test', makeSignal('moderate', { flatQuality: true }));
    expect(result).toHaveLength(2);
    const types = result.map((r) => r.strategyType);
    expect(types).toContain('change_scaffold');
    expect(types).toContain('enable_multi_stage');
    expect(result[0].familyKey).toBe('fam:test');
    expect(result[0].id).toBeTruthy();
    expect(result[0].createdAt).toBeTruthy();
  });

  it('generates split_task for risingCost', () => {
    const result = service.generateStrategies('fam:test', makeSignal('severe', { risingCost: true }));
    expect(result).toHaveLength(1);
    expect(result[0].strategyType).toBe('split_task');
    expect(result[0].expectedImpact).toBe('medium');
  });

  it('generates insert_critique for risingCorrectionBurden', () => {
    const result = service.generateStrategies('fam:test', makeSignal('moderate', { risingCorrectionBurden: true }));
    expect(result).toHaveLength(1);
    expect(result[0].strategyType).toBe('insert_critique');
    expect(result[0].expectedImpact).toBe('high');
  });

  it('generates escalate_model for repeatedFallbacks', () => {
    const result = service.generateStrategies('fam:test', makeSignal('severe', { repeatedFallbacks: true }));
    expect(result).toHaveLength(1);
    expect(result[0].strategyType).toBe('escalate_model');
    expect(result[0].expectedImpact).toBe('high');
  });

  it('generates escalate_model and enable_multi_stage for persistentUnderperformance', () => {
    const result = service.generateStrategies('fam:test', makeSignal('severe', { persistentUnderperformance: true }));
    expect(result).toHaveLength(2);
    const types = result.map((r) => r.strategyType);
    expect(types).toContain('escalate_model');
    expect(types).toContain('enable_multi_stage');
  });

  it('generates strategies for all indicators at once', () => {
    const result = service.generateStrategies('fam:test', makeSignal('severe', {
      flatQuality: true,
      risingCost: true,
      risingCorrectionBurden: true,
      repeatedFallbacks: true,
      persistentUnderperformance: true,
    }));
    // flatQuality: 2, risingCost: 1, risingCorrectionBurden: 1, repeatedFallbacks: 1, persistentUnderperformance: 2
    expect(result).toHaveLength(7);
  });

  it('all generated strategies have unique ids', () => {
    const result = service.generateStrategies('fam:test', makeSignal('severe', {
      flatQuality: true,
      risingCost: true,
      risingCorrectionBurden: true,
      repeatedFallbacks: true,
      persistentUnderperformance: true,
    }));
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses the provided familyKey on all strategies', () => {
    const result = service.generateStrategies('custom-key', makeSignal('severe', { flatQuality: true }));
    for (const s of result) {
      expect(s.familyKey).toBe('custom-key');
    }
  });

  it('flatQuality change_scaffold has medium impact', () => {
    const result = service.generateStrategies('fam:test', makeSignal('moderate', { flatQuality: true }));
    const scaffold = result.find((r) => r.strategyType === 'change_scaffold');
    expect(scaffold!.expectedImpact).toBe('medium');
  });

  it('flatQuality enable_multi_stage has high impact', () => {
    const result = service.generateStrategies('fam:test', makeSignal('moderate', { flatQuality: true }));
    const ms = result.find((r) => r.strategyType === 'enable_multi_stage');
    expect(ms!.expectedImpact).toBe('high');
  });

  it('persistentUnderperformance enable_multi_stage has medium impact', () => {
    const result = service.generateStrategies('fam:test', makeSignal('severe', { persistentUnderperformance: true }));
    const ms = result.find((r) => r.strategyType === 'enable_multi_stage');
    expect(ms!.expectedImpact).toBe('medium');
  });
});
