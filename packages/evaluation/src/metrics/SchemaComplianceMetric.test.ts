import { describe, it, expect } from 'vitest';
import { evaluateSchemaCompliance } from './SchemaComplianceMetric.js';

describe('evaluateSchemaCompliance', () => {
  it('returns 0.0 (non-compliant) when structuredOutput is null', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: null,
      expectedSchema: { name: 'string' },
    });
    expect(result.score).toBe(0.0);
    expect(result.details.level).toBe('non-compliant');
  });

  it('returns 1.0 (compliant) when expectedSchema is empty', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { anything: 42 },
      expectedSchema: {},
    });
    expect(result.score).toBe(1.0);
    expect(result.details.level).toBe('compliant');
  });

  it('returns 1.0 when all fields match types', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { name: 'Alice', age: 30 },
      expectedSchema: { name: 'string', age: 'number' },
    });
    expect(result.score).toBe(1.0);
    expect(result.details.level).toBe('compliant');
  });

  it('returns 0.5 (partial) when >= 50% of fields match', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { name: 'Alice', age: 'not-a-number' },
      expectedSchema: { name: 'string', age: 'number' },
    });
    // 1 out of 2 = 0.5 ratio -> partial
    expect(result.score).toBe(0.5);
    expect(result.details.level).toBe('partial');
  });

  it('returns 0.0 (non-compliant) when < 50% of fields match', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { name: 123 },
      expectedSchema: { name: 'string', age: 'number', active: 'boolean' },
    });
    // 0 out of 3 matched (name wrong type, age missing, active missing)
    expect(result.score).toBe(0.0);
    expect(result.details.level).toBe('non-compliant');
  });

  it('handles "array" type check', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { items: [1, 2, 3] },
      expectedSchema: { items: 'array' },
    });
    expect(result.score).toBe(1.0);
  });

  it('handles "any" type check (always matches)', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { data: 'whatever' },
      expectedSchema: { data: 'any' },
    });
    expect(result.score).toBe(1.0);
  });

  it('handles "null" type check', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { value: null },
      expectedSchema: { value: 'null' },
    });
    expect(result.score).toBe(1.0);
  });

  it('reports missing fields and type mismatches in details', () => {
    const result = evaluateSchemaCompliance({
      structuredOutput: { name: 123 },
      expectedSchema: { name: 'string', age: 'number' },
    });
    expect(result.details.missingFields).toContain('age');
    expect(result.details.typeMismatches).toContain('name');
  });
});
