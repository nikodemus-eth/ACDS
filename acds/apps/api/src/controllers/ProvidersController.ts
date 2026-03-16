// ---------------------------------------------------------------------------
// ProvidersController – thin controller delegating to domain services
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProviderRegistryService } from '@acds/provider-broker';
import type { ProviderConnectionTester } from '@acds/provider-broker';
import type { ProviderHealthService } from '@acds/provider-broker';
import type { CreateProviderInput } from '@acds/core-types';
import type { SecretRotationService } from '@acds/security';
import { ProviderPresenter } from '../presenters/ProviderPresenter.js';

interface ProviderIdParams {
  id: string;
}

export class ProvidersController {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly connectionTester: ProviderConnectionTester,
    private readonly secretRotation: SecretRotationService,
    private readonly healthService: ProviderHealthService,
  ) {}

  // ── POST / ──────────────────────────────────────────────────────────
  async create(
    request: FastifyRequest<{ Body: CreateProviderInput }>,
    reply: FastifyReply,
  ): Promise<void> {
    const provider = await this.registry.create(request.body);
    reply.status(201).send(ProviderPresenter.toView(provider));
  }

  // ── GET / ───────────────────────────────────────────────────────────
  async list(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const providers = await this.registry.listAll();
    reply.send(ProviderPresenter.toViewList(providers));
  }

  // ── GET /:id ────────────────────────────────────────────────────────
  async getById(
    request: FastifyRequest<{ Params: ProviderIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const provider = await this.registry.getById(request.params.id);
    if (!provider) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Provider ${request.params.id} not found`,
        statusCode: 404,
      });
      return;
    }
    const health = await this.healthService.getHealth(provider.id);
    reply.send(ProviderPresenter.toView(provider, health));
  }

  // ── PUT /:id ────────────────────────────────────────────────────────
  async update(
    request: FastifyRequest<{ Params: ProviderIdParams; Body: Partial<CreateProviderInput> }>,
    reply: FastifyReply,
  ): Promise<void> {
    const provider = await this.registry.update(request.params.id, request.body);
    reply.send(ProviderPresenter.toView(provider));
  }

  // ── POST /:id/disable ──────────────────────────────────────────────
  async disable(
    request: FastifyRequest<{ Params: ProviderIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const provider = await this.registry.disable(request.params.id);
    reply.send(ProviderPresenter.toView(provider));
  }

  // ── POST /:id/test-connection ──────────────────────────────────────
  async testConnection(
    request: FastifyRequest<{ Params: ProviderIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const provider = await this.registry.getById(request.params.id);
    if (!provider) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Provider ${request.params.id} not found`,
        statusCode: 404,
      });
      return;
    }
    const result = await this.connectionTester.testConnection(provider);
    reply.send(result);
  }

  // ── POST /:id/rotate-secret ───────────────────────────────────────
  async rotateSecret(
    request: FastifyRequest<{ Params: ProviderIdParams; Body: { newSecret: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const provider = await this.registry.getById(request.params.id);
    if (!provider) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Provider ${request.params.id} not found`,
        statusCode: 404,
      });
      return;
    }

    const { newSecret } = request.body ?? {};
    if (!newSecret || typeof newSecret !== 'string' || newSecret.trim().length === 0) {
      reply.status(400).send({
        error: 'Bad Request',
        message: 'Field newSecret is required and must be a non-empty string.',
        statusCode: 400,
      });
      return;
    }

    const result = await this.secretRotation.rotateSecret(request.params.id, newSecret);
    reply.status(200).send({
      message: `Secret rotated for provider ${request.params.id}`,
      providerId: result.providerId,
      rotatedAt: result.rotatedAt.toISOString(),
      newKeyId: result.newKeyId,
    });
  }
}
