import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateOutputSchema } from './schema-validator.js';

describe('Schema Validator', () => {
  it('passes for valid output', () => {
    const schema = z.object({ text: z.string() });
    const result = validateOutputSchema({ text: 'hello' }, schema);
    expect(result.status).toBe('pass');
    expect(result.severity).toBe('low');
  });

  it('fails for invalid output', () => {
    const schema = z.object({ text: z.string() });
    const result = validateOutputSchema({ text: 123 }, schema);
    expect(result.status).toBe('fail');
    expect(result.severity).toBe('high');
    expect(result.details?.errors).toBeDefined();
  });

  it('fails for missing required fields', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = validateOutputSchema({}, schema);
    expect(result.status).toBe('fail');
  });
});
