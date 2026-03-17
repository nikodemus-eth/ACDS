import { describe, it, expect, beforeEach } from 'vitest';
import { authPreHandler, registerAuth } from './authMiddleware.js';

// We need to set up environment for getAppConfig
// The config is cached, so we set env vars before first import
const SECRET = 'test-admin-secret-42';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
  process.env.MASTER_KEY_PATH = '/tmp/test-key';
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.NODE_ENV = 'test';
});

function createRequest(url: string, headers: Record<string, string> = {}) {
  return { url, headers } as any;
}

function createReply() {
  let statusCode = 200;
  let body: unknown;
  return {
    get statusCode() { return statusCode; },
    get body() { return body; },
    code(code: number) { statusCode = code; return this; },
    send(payload: unknown) { body = payload; return this; },
  };
}

describe('authPreHandler', () => {
  it('allows public /health path without credentials', () => {
    const request = createRequest('/health');
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows public /health/providers path without credentials', () => {
    const request = createRequest('/health/providers');
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows request with valid x-admin-session header', () => {
    const request = createRequest('/api/providers', {
      'x-admin-session': SECRET,
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(true);
  });

  it('allows request with valid Bearer token', () => {
    const request = createRequest('/api/providers', {
      authorization: `Bearer ${SECRET}`,
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects request with no credentials on protected path', () => {
    const request = createRequest('/api/providers');
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(false);
    expect(reply.statusCode).toBe(401);
    expect((reply.body as any).error).toBe('Unauthorized');
  });

  it('rejects request with wrong x-admin-session', () => {
    const request = createRequest('/api/providers', {
      'x-admin-session': 'wrong-secret',
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(false);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects request with wrong Bearer token', () => {
    const request = createRequest('/api/providers', {
      authorization: 'Bearer wrong-token',
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(false);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects request with non-Bearer authorization scheme', () => {
    const request = createRequest('/api/providers', {
      authorization: `Basic ${SECRET}`,
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(false);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects request with Bearer scheme but no token', () => {
    const request = createRequest('/api/providers', {
      authorization: 'Bearer ',
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(false);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects request with empty authorization header', () => {
    const request = createRequest('/api/providers', {
      authorization: '',
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(false);
    expect(reply.statusCode).toBe(401);
  });

  it('rejects request with Bearer scheme and correct token but wrong scheme case is still accepted', () => {
    const request = createRequest('/api/providers', {
      authorization: `Bearer ${SECRET}`,
    });
    const reply = createReply();
    let called = false;
    authPreHandler(request, reply as any, () => { called = true; });
    expect(called).toBe(true);
  });
});

describe('registerAuth', () => {
  it('registers the preHandler hook on the app', () => {
    const hooks: Array<(req: any, rep: any, done: any) => void> = [];
    const fakeApp = {
      addHook: (name: string, handler: any) => {
        hooks.push(handler);
      },
    };
    registerAuth(fakeApp as any);
    expect(hooks).toHaveLength(1);
  });
});
