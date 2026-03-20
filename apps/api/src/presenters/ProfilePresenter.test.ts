import { describe, it, expect } from 'vitest';
import { ProfilePresenter } from './ProfilePresenter.js';
import type { ModelProfile, TacticProfile } from '@acds/core-types';

const now = new Date('2026-03-15T10:00:00Z');

function makeModelProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    id: 'mp-1',
    name: 'GPT-4o',
    vendor: 'openai' as any,
    modelId: 'gpt-4o',
    cognitiveGrade: 'advanced' as any,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    supportsStructuredOutput: true,
    supportsStreaming: true,
    inputCostPer1kTokens: 0.005,
    outputCostPer1kTokens: 0.015,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ModelProfile;
}

function makeTacticProfile(overrides: Partial<TacticProfile> = {}): TacticProfile {
  return {
    id: 'tp-1',
    name: 'Zero-shot',
    description: 'Direct prompting',
    systemPromptTemplate: 'You are a helpful assistant.',
    userPromptTemplate: '{{input}}',
    applicableTaskTypes: ['generation' as any],
    applicableCognitiveGrades: ['basic' as any, 'advanced' as any],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as TacticProfile;
}

describe('ProfilePresenter', () => {
  describe('toModelView', () => {
    it('converts dates to ISO strings', () => {
      const view = ProfilePresenter.toModelView(makeModelProfile());
      expect(view.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.updatedAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.id).toBe('mp-1');
      expect(view.name).toBe('GPT-4o');
    });
  });

  describe('toModelViewList', () => {
    it('maps multiple model profiles', () => {
      const profiles = [makeModelProfile({ id: 'mp-1' }), makeModelProfile({ id: 'mp-2' })];
      const views = ProfilePresenter.toModelViewList(profiles);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('mp-1');
      expect(views[1].id).toBe('mp-2');
    });

    it('returns empty array for empty input', () => {
      expect(ProfilePresenter.toModelViewList([])).toEqual([]);
    });
  });

  describe('toTacticView', () => {
    it('converts dates to ISO strings', () => {
      const view = ProfilePresenter.toTacticView(makeTacticProfile());
      expect(view.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.updatedAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.id).toBe('tp-1');
      expect(view.name).toBe('Zero-shot');
    });
  });

  describe('toTacticViewList', () => {
    it('maps multiple tactic profiles', () => {
      const profiles = [makeTacticProfile({ id: 'tp-1' }), makeTacticProfile({ id: 'tp-2' })];
      const views = ProfilePresenter.toTacticViewList(profiles);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('tp-1');
      expect(views[1].id).toBe('tp-2');
    });

    it('returns empty array for empty input', () => {
      expect(ProfilePresenter.toTacticViewList([])).toEqual([]);
    });
  });
});
