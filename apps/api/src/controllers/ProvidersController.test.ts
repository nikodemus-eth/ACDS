import { describe, it, expect } from 'vitest';
import { ProvidersController } from './ProvidersController.js';

function createReply() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(payload: unknown) { this.body = payload; return this; },
  };
}

const now = new Date('2026-03-15T10:00:00Z');

function makeProvider(id: string) {
  return {
    id,
    name: `Provider ${id}`,
    vendor: 'openai',
    authType: 'api_key',
    baseUrl: 'https://api.openai.com',
    enabled: true,
    environment: 'production',
    createdAt: now,
    updatedAt: now,
  };
}

describe('ProvidersController', () => {
  function makeController(overrides: Record<string, any> = {}) {
    const registry = {
      create: async (input: any) => ({ ...makeProvider('new-1'), ...input }),
      listAll: async () => [makeProvider('prov-1'), makeProvider('prov-2')],
      getById: async (id: string) => id === 'prov-1' ? makeProvider('prov-1') : null,
      update: async (id: string, body: any) => ({ ...makeProvider(id), ...body }),
      disable: async (id: string) => ({ ...makeProvider(id), enabled: false }),
      ...overrides.registry,
    };
    const connectionTester = {
      testConnection: async () => ({ success: true, latencyMs: 120 }),
      ...overrides.connectionTester,
    };
    const secretRotation = {
      rotateSecret: async (providerId: string, _newSecret: string) => ({
        providerId,
        rotatedAt: now,
        newKeyId: 'key-abc',
      }),
      ...overrides.secretRotation,
    };
    const healthService = {
      getHealth: async () => ({
        providerId: 'prov-1',
        status: 'healthy',
        lastTestAt: now,
        lastSuccessAt: now,
        lastFailureAt: null,
        latencyMs: 100,
        message: null,
      }),
      ...overrides.healthService,
    };

    return new ProvidersController(
      registry as any,
      connectionTester as any,
      secretRotation as any,
      healthService as any,
    );
  }

  it('create returns 201 with provider view', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.create({ body: { name: 'NewProv' } } as any, reply as any);
    expect(reply.statusCode).toBe(201);
    expect((reply.body as any).name).toBe('NewProv');
  });

  it('list returns array of provider views', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.list({} as any, reply as any);
    expect((reply.body as any[]).length).toBe(2);
  });

  it('getById returns provider with health when found', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.getById({ params: { id: 'prov-1' } } as any, reply as any);
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).health).toBeDefined();
    expect((reply.body as any).health.status).toBe('healthy');
  });

  it('getById returns 404 when not found', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.getById({ params: { id: 'missing' } } as any, reply as any);
    expect(reply.statusCode).toBe(404);
  });

  it('update returns updated provider', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.update(
      { params: { id: 'prov-1' }, body: { name: 'Updated' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).name).toBe('Updated');
  });

  it('disable returns provider with enabled=false', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.disable({ params: { id: 'prov-1' } } as any, reply as any);
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).enabled).toBe(false);
  });

  it('testConnection returns 404 when provider not found', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.testConnection({ params: { id: 'missing' } } as any, reply as any);
    expect(reply.statusCode).toBe(404);
  });

  it('testConnection returns result when provider exists', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.testConnection({ params: { id: 'prov-1' } } as any, reply as any);
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).success).toBe(true);
  });

  it('rotateSecret returns 404 when provider not found', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.rotateSecret(
      { params: { id: 'missing' }, body: { newSecret: 'sec' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(404);
  });

  it('rotateSecret returns 400 when newSecret is missing', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.rotateSecret(
      { params: { id: 'prov-1' }, body: {} } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
    expect((reply.body as any).message).toContain('newSecret');
  });

  it('rotateSecret returns 400 when newSecret is empty string', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.rotateSecret(
      { params: { id: 'prov-1' }, body: { newSecret: '   ' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('rotateSecret returns 400 when newSecret is not a string', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.rotateSecret(
      { params: { id: 'prov-1' }, body: { newSecret: 123 } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('rotateSecret returns 400 when body is null', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.rotateSecret(
      { params: { id: 'prov-1' }, body: null } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(400);
  });

  it('rotateSecret succeeds with valid newSecret', async () => {
    const controller = makeController();
    const reply = createReply();
    await controller.rotateSecret(
      { params: { id: 'prov-1' }, body: { newSecret: 'new-key-123' } } as any,
      reply as any,
    );
    expect(reply.statusCode).toBe(200);
    expect((reply.body as any).newKeyId).toBe('key-abc');
    expect((reply.body as any).providerId).toBe('prov-1');
  });
});
