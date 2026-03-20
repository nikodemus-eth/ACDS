import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IntentEnvelope, TriageDecision } from '@acds/core-types';
import type { TriagePipelineDeps } from '@acds/routing-engine';
import { TriagePipeline } from '@acds/routing-engine';

export interface TriageService {
  buildTriageDeps(envelope: IntentEnvelope): Promise<TriagePipelineDeps>;
}

export interface TriageRunService {
  buildTriageDeps(envelope: IntentEnvelope): Promise<TriagePipelineDeps>;
  executeFromDecision(decision: TriageDecision, inputPayload: unknown): Promise<unknown>;
}

export class TriageController {
  private readonly pipeline = new TriagePipeline();

  constructor(
    private readonly triageService: TriageRunService,
  ) {}

  async triage(
    request: FastifyRequest<{ Body: IntentEnvelope }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const deps = await this.triageService.buildTriageDeps(request.body);
      const result = this.pipeline.triage(request.body, deps);

      if (!result.ok) {
        const status = result.error.error === 'INVALID_INTENT_ENVELOPE' ? 400 : 503;
        reply.status(status).send(result.error);
        return;
      }

      reply.send(result.decision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        error: 'Internal Server Error',
        message,
        statusCode: 500,
      });
    }
  }

  async triageAndRun(
    request: FastifyRequest<{ Body: { envelope: IntentEnvelope; inputPayload: unknown } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { envelope, inputPayload } = request.body;
      const deps = await this.triageService.buildTriageDeps(envelope);
      const result = this.pipeline.triage(envelope, deps);

      if (!result.ok) {
        const status = result.error.error === 'INVALID_INTENT_ENVELOPE' ? 400 : 503;
        reply.status(status).send(result.error);
        return;
      }

      const executionResult = await this.triageService.executeFromDecision(
        result.decision,
        inputPayload,
      );

      reply.send({
        triageDecision: result.decision,
        executionResult,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';
      console.error('[triage/run] Unhandled error:', errMsg, stack);
      reply.status(500).send({
        error: 'Internal Server Error',
        message: errMsg,
        statusCode: 500,
      });
    }
  }
}
