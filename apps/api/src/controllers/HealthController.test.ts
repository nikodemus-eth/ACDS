import { describe, it, expect, beforeAll } from 'vitest';
import { HealthController } from './HealthController.js';

// Set required env vars before getAppConfig() is called
beforeAll(() => {
  process.env['DATABASE_URL'] = process.env['DATABASE_URL'] || 'postgres://localhost/test';
  process.env['MASTER_KEY_PATH'] = process.env['MASTER_KEY_PATH'] || '/tmp/test-master-key';
  process.env['ADMIN_SESSION_SECRET'] = process.env['ADMIN_SESSION_SECRET'] || 'test-secret';
  process.env['NODE_ENV'] = 'test';
});

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

describe('HealthController', () => {
  it('appHealth returns status ok with version and environment', async () => {
    const controller = new HealthController({
      getAllHealth: async () => [],
    } as any);

    const reply = createReply();
    await controller.appHealth({} as any, reply as any);

    expect(reply.statusCode).toBe(200);
    const body = reply.body as any;
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.environment).toBeDefined();
    expect(typeof body.uptime).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  it('providerHealthSummary returns categorized health', async () => {
    const healthRecords = [
      { providerId: 'p1', status: 'healthy', lastTestAt: new Date(), latencyMs: 100, message: null },
      { providerId: 'p2', status: 'degraded', lastTestAt: new Date(), latencyMs: 500, message: 'slow' },
      { providerId: 'p3', status: 'unhealthy', lastTestAt: null, latencyMs: null, message: 'down' },
      { providerId: 'p4', status: 'unknown', lastTestAt: null, latencyMs: null, message: null },
    ];

    const controller = new HealthController({
      getAllHealth: async () => healthRecords,
    } as any);

    const reply = createReply();
    await controller.providerHealthSummary({} as any, reply as any);

    const body = reply.body as any;
    expect(body.total).toBe(4);
    expect(body.healthy).toBe(1);
    expect(body.degraded).toBe(1);
    expect(body.unhealthy).toBe(1);
    expect(body.unknown).toBe(1);
    expect(body.providers).toHaveLength(4);
    expect(body.providers[0].lastTestAt).toBeDefined();
    expect(body.providers[2].lastTestAt).toBeNull();
  });
});
