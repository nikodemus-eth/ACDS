import { describe, it, expect } from 'vitest';
import { AdapterError } from './AdapterError.js';

describe('AdapterError', () => {
  it('sets name to AdapterError', () => {
    const err = new AdapterError({ message: 'test', code: 'TEST' });
    expect(err.name).toBe('AdapterError');
  });

  it('stores message and code', () => {
    const err = new AdapterError({ message: 'Something broke', code: 'HTTP_ERROR' });
    expect(err.message).toBe('Something broke');
    expect(err.code).toBe('HTTP_ERROR');
  });

  it('stores providerId when provided', () => {
    const err = new AdapterError({ message: 'fail', code: 'X', providerId: 'prov-42' });
    expect(err.providerId).toBe('prov-42');
  });

  it('leaves providerId undefined when not provided', () => {
    const err = new AdapterError({ message: 'fail', code: 'X' });
    expect(err.providerId).toBeUndefined();
  });

  it('stores statusCode when provided', () => {
    const err = new AdapterError({ message: 'fail', code: 'HTTP_ERROR', statusCode: 502 });
    expect(err.statusCode).toBe(502);
  });

  it('leaves statusCode undefined when not provided', () => {
    const err = new AdapterError({ message: 'fail', code: 'X' });
    expect(err.statusCode).toBeUndefined();
  });

  it('defaults retryable to false', () => {
    const err = new AdapterError({ message: 'fail', code: 'X' });
    expect(err.retryable).toBe(false);
  });

  it('accepts retryable = true', () => {
    const err = new AdapterError({ message: 'fail', code: 'X', retryable: true });
    expect(err.retryable).toBe(true);
  });

  it('accepts retryable = false explicitly', () => {
    const err = new AdapterError({ message: 'fail', code: 'X', retryable: false });
    expect(err.retryable).toBe(false);
  });

  it('stores cause error', () => {
    const cause = new Error('root cause');
    const err = new AdapterError({ message: 'wrapped', code: 'WRAP', cause });
    expect(err.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const err = new AdapterError({ message: 'test', code: 'TEST' });
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of AdapterError', () => {
    const err = new AdapterError({ message: 'test', code: 'TEST' });
    expect(err).toBeInstanceOf(AdapterError);
  });

  it('stores all fields together', () => {
    const cause = new Error('root');
    const err = new AdapterError({
      message: 'full test',
      code: 'FULL',
      providerId: 'prov-99',
      statusCode: 503,
      retryable: true,
      cause,
    });
    expect(err.message).toBe('full test');
    expect(err.code).toBe('FULL');
    expect(err.providerId).toBe('prov-99');
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('AdapterError');
  });
});
