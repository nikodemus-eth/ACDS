import { describe, it, expect } from 'vitest';
import { registerErrorHandler } from './errorMiddleware.js';

describe('registerErrorHandler', () => {
  it('registers an error handler on the app instance', () => {
    let registeredHandler: any;
    const fakeApp = {
      setErrorHandler: (handler: any) => { registeredHandler = handler; },
      config: { nodeEnv: 'test' },
    };

    registerErrorHandler(fakeApp as any);
    expect(registeredHandler).toBeDefined();
  });

  it('the error handler extracts statusCode from error object', () => {
    let registeredHandler: any;
    const fakeApp = {
      setErrorHandler: (handler: any) => { registeredHandler = handler; },
      config: { nodeEnv: 'test' },
    };

    registerErrorHandler(fakeApp as any);

    const reply = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      send(payload: unknown) { this.body = payload; return this; },
    };

    const error = Object.assign(new Error('bad request'), { statusCode: 400 });
    const request = {
      url: '/test',
      log: { error: () => {} },
    };

    registeredHandler(error, request, reply);

    expect(reply.statusCode).toBe(400);
    const body = reply.body as any;
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain('bad request');
  });

  it('uses status field as fallback for statusCode', () => {
    let registeredHandler: any;
    const fakeApp = {
      setErrorHandler: (handler: any) => { registeredHandler = handler; },
      config: { nodeEnv: 'test' },
    };

    registerErrorHandler(fakeApp as any);

    const reply = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      send(payload: unknown) { this.body = payload; return this; },
    };

    const error = Object.assign(new Error('not found'), { status: 404 });
    const request = { url: '/test', log: { error: () => {} } };

    registeredHandler(error, request, reply);
    expect(reply.statusCode).toBe(404);
  });

  it('defaults to 500 when no statusCode is available', () => {
    let registeredHandler: any;
    const fakeApp = {
      setErrorHandler: (handler: any) => { registeredHandler = handler; },
      config: { nodeEnv: 'test' },
    };

    registerErrorHandler(fakeApp as any);

    const reply = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      send(payload: unknown) { this.body = payload; return this; },
    };

    const error = new Error('internal');
    const request = { url: '/test', log: { error: () => {} } };

    registeredHandler(error, request, reply);
    expect(reply.statusCode).toBe(500);
    expect((reply.body as any).error).toBe('Internal Server Error');
  });

  it('masks message in production for 500 errors', () => {
    let registeredHandler: any;
    const fakeApp = {
      setErrorHandler: (handler: any) => { registeredHandler = handler; },
      config: { nodeEnv: 'production' },
    };

    registerErrorHandler(fakeApp as any);

    const reply = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      send(payload: unknown) { this.body = payload; return this; },
    };

    const error = new Error('secret internal detail');
    const request = { url: '/test', log: { error: () => {} } };

    registeredHandler(error, request, reply);
    expect(reply.statusCode).toBe(500);
    expect((reply.body as any).message).toBe('An unexpected error occurred');
  });

  it('shows message in non-production for 500 errors', () => {
    let registeredHandler: any;
    const fakeApp = {
      setErrorHandler: (handler: any) => { registeredHandler = handler; },
      config: { nodeEnv: 'development' },
    };

    registerErrorHandler(fakeApp as any);

    const reply = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      send(payload: unknown) { this.body = payload; return this; },
    };

    const error = new Error('debug message');
    const request = { url: '/test', log: { error: () => {} } };

    registeredHandler(error, request, reply);
    expect(reply.statusCode).toBe(500);
    expect((reply.body as any).message).toContain('debug message');
  });
});
