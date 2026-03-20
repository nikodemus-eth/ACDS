import { describe, it, expect } from 'vitest';
import { TASK_FIXTURES } from './task-fixtures.js';

describe('Task Fixtures', () => {
  it('has all expected task types', () => {
    expect(TASK_FIXTURES.summarize).toBeDefined();
    expect(TASK_FIXTURES.transcribe).toBeDefined();
    expect(TASK_FIXTURES.readAloud).toBeDefined();
    expect(TASK_FIXTURES.ocr).toBeDefined();
    expect(TASK_FIXTURES.translate).toBeDefined();
    expect(TASK_FIXTURES.generateImage).toBeDefined();
    expect(TASK_FIXTURES.classifySound).toBeDefined();
  });

  it('each fixture has task and input', () => {
    for (const [_key, fixture] of Object.entries(TASK_FIXTURES)) {
      expect(typeof fixture.task).toBe('string');
      expect(fixture.input).toBeDefined();
    }
  });

  it('summarize fixture has text input', () => {
    expect(typeof TASK_FIXTURES.summarize.input.text).toBe('string');
    expect(TASK_FIXTURES.summarize.input.text.length).toBeGreaterThan(0);
  });
});
