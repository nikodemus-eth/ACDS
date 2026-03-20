import { describe, it, expect } from 'vitest';
import { CapabilityTestController } from './CapabilityTestController.js';
import { CapabilityTestService, type CapabilityTestDeps } from '../services/CapabilityTestService.js';
import type { CapabilityTestResponse, CapabilityManifestEntry, Provider } from '@acds/core-types';

function mockReply() {
  let statusCode = 200;
  let body: unknown;
  return {
    status(code: number) { statusCode = code; return this; },
    send(data: unknown) { body = data; },
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

// Build a real CapabilityTestService with controlled deps
function makeProvider(id: string, enabled = true): Provider {
  return {
    id,
    name: 'Test Provider',
    vendor: 'openai' as any,
    authType: 'api_key' as any,
    baseUrl: 'https://api.openai.com',
    enabled,
    environment: 'cloud',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeServiceDeps(options: {
  provider?: Provider | null;
  executeResult?: any;
  executeError?: Error;
} = {}): CapabilityTestDeps {
  return {
    registryService: {
      getById: async (id: string) => options.provider ?? null,
    } as any,
    executionProxy: {
      execute: async () => {
        if (options.executeError) throw options.executeError;
        return options.executeResult ?? {
          content: 'Hello world',
          model: 'gpt-4o',
          inputTokens: 10,
          outputTokens: 20,
          finishReason: 'stop',
          latencyMs: 100,
        };
      },
    } as any,
    resolveApiKey: async () => 'test-key',
  };
}

describe('CapabilityTestController', () => {
  describe('getManifest', () => {
    it('returns manifest for existing provider', async () => {
      const deps = makeServiceDeps({ provider: makeProvider('p1') });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.getManifest({ params: { id: 'p1' } } as any, reply as any);

      const body = reply.getBody() as CapabilityManifestEntry[];
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body[0].capabilityId).toBe('text.generate');
    });

    it('returns 404 for non-existent provider', async () => {
      const deps = makeServiceDeps({ provider: null });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.getManifest({ params: { id: 'nonexistent' } } as any, reply as any);

      expect(reply.getStatus()).toBe(404);
      expect((reply.getBody() as any).message).toContain('not found');
    });

    it('returns 500 for unexpected errors', async () => {
      const deps = makeServiceDeps();
      deps.registryService = {
        getById: async () => { throw new Error('DB crash'); },
      } as any;
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.getManifest({ params: { id: 'p1' } } as any, reply as any);

      expect(reply.getStatus()).toBe(500);
      expect((reply.getBody() as any).message).toBe('DB crash');
    });
  });

  describe('testCapability', () => {
    it('returns test result for valid capability', async () => {
      const deps = makeServiceDeps({ provider: makeProvider('p1') });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.testCapability(
        { params: { id: 'p1', capabilityId: 'text.generate' }, body: { input: { text: 'hello' } } } as any,
        reply as any,
      );

      const body = reply.getBody() as CapabilityTestResponse;
      expect(body.success).toBe(true);
      expect(body.capabilityId).toBe('text.generate');
    });

    it('returns 400 when input is missing', async () => {
      const deps = makeServiceDeps({ provider: makeProvider('p1') });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.testCapability(
        { params: { id: 'p1', capabilityId: 'text.generate' }, body: {} } as any,
        reply as any,
      );

      expect(reply.getStatus()).toBe(400);
      expect((reply.getBody() as any).message).toContain('input');
    });

    it('returns 400 when input is not an object', async () => {
      const deps = makeServiceDeps({ provider: makeProvider('p1') });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.testCapability(
        { params: { id: 'p1', capabilityId: 'text.generate' }, body: { input: 'string' } } as any,
        reply as any,
      );

      expect(reply.getStatus()).toBe(400);
    });

    it('returns 400 when body is null/undefined', async () => {
      const deps = makeServiceDeps({ provider: makeProvider('p1') });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.testCapability(
        { params: { id: 'p1', capabilityId: 'text.generate' }, body: undefined } as any,
        reply as any,
      );

      expect(reply.getStatus()).toBe(400);
    });

    it('returns 404 for non-existent provider', async () => {
      const deps = makeServiceDeps({ provider: null });
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.testCapability(
        { params: { id: 'missing', capabilityId: 'text.generate' }, body: { input: { text: 'hi' } } } as any,
        reply as any,
      );

      expect(reply.getStatus()).toBe(404);
    });

    it('returns 500 for unexpected service error', async () => {
      const deps = makeServiceDeps();
      deps.registryService = {
        getById: async () => { throw new Error('unexpected failure'); },
      } as any;
      const service = new CapabilityTestService(deps);
      const controller = new CapabilityTestController(service);
      const reply = mockReply();

      await controller.testCapability(
        { params: { id: 'p1', capabilityId: 'text.generate' }, body: { input: { text: 'hi' } } } as any,
        reply as any,
      );

      expect(reply.getStatus()).toBe(500);
    });
  });
});
