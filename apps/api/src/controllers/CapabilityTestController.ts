// ---------------------------------------------------------------------------
// CapabilityTestController – handles capability manifest and test endpoints
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CapabilityTestService } from '../services/CapabilityTestService.js';

interface ProviderIdParams {
  id: string;
}

interface CapabilityTestParams {
  id: string;
  capabilityId: string;
}

interface CapabilityTestBody {
  input: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export class CapabilityTestController {
  constructor(private readonly service: CapabilityTestService) {}

  async getManifest(
    request: FastifyRequest<{ Params: ProviderIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const manifest = await this.service.getManifest(request.params.id);
      reply.send(manifest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        reply.status(404).send({
          error: 'Not Found',
          message,
          statusCode: 404,
        });
        return;
      }
      reply.status(500).send({
        error: 'Internal Server Error',
        message,
        statusCode: 500,
      });
    }
  }

  async testCapability(
    request: FastifyRequest<{ Params: CapabilityTestParams; Body: CapabilityTestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id, capabilityId } = request.params;
    const { input } = request.body ?? {};

    if (!input || typeof input !== 'object') {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Field "input" is required and must be an object.',
        statusCode: 400,
      });
      return;
    }

    try {
      const result = await this.service.testCapability(id, capabilityId, input);
      reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        reply.status(404).send({
          error: 'Not Found',
          message,
          statusCode: 404,
        });
        return;
      }
      reply.status(500).send({
        error: 'Internal Server Error',
        message,
        statusCode: 500,
      });
    }
  }
}
