import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ModelProfile, TacticProfile } from '@acds/core-types';
import { ProfilePresenter } from '../presenters/ProfilePresenter.js';
import { ProfileCatalogService } from '../services/ProfileCatalogService.js';

interface ProfileIdParams {
  id: string;
}

type CreateModelProfileBody = Partial<ModelProfile>;
type CreateTacticProfileBody = Partial<TacticProfile>;

export class ProfilesController {
  constructor(private readonly catalog: ProfileCatalogService) {}

  async listModelProfiles(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.send(ProfilePresenter.toModelViewList(await this.catalog.listModelProfiles()));
  }

  async getModelProfile(
    request: FastifyRequest<{ Params: ProfileIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const profile = await this.catalog.getModelProfile(request.params.id);
    if (!profile) {
      reply.status(404).send({ error: 'Not Found', message: `Model profile ${request.params.id} not found`, statusCode: 404 });
      return;
    }
    reply.send(ProfilePresenter.toModelView(profile));
  }

  async createModelProfile(
    request: FastifyRequest<{ Body: CreateModelProfileBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const profile = await this.catalog.createModelProfile({
      name: request.body.name ?? 'unnamed_model_profile',
      description: request.body.description,
      supportedTaskTypes: request.body.supportedTaskTypes,
      supportedLoadTiers: request.body.supportedLoadTiers,
      minimumCognitiveGrade: request.body.minimumCognitiveGrade,
      localOnly: request.body.localOnly,
      cloudAllowed: request.body.cloudAllowed,
      enabled: request.body.enabled,
    });
    reply.status(201).send(ProfilePresenter.toModelView(profile));
  }

  async updateModelProfile(
    request: FastifyRequest<{ Params: ProfileIdParams; Body: CreateModelProfileBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const profile = await this.catalog.updateModelProfile(request.params.id, request.body);
    if (!profile) {
      reply.status(404).send({ error: 'Not Found', message: `Model profile ${request.params.id} not found`, statusCode: 404 });
      return;
    }
    reply.send(ProfilePresenter.toModelView(profile));
  }

  async listTacticProfiles(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.send(ProfilePresenter.toTacticViewList(await this.catalog.listTacticProfiles()));
  }

  async getTacticProfile(
    request: FastifyRequest<{ Params: ProfileIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const profile = await this.catalog.getTacticProfile(request.params.id);
    if (!profile) {
      reply.status(404).send({ error: 'Not Found', message: `Tactic profile ${request.params.id} not found`, statusCode: 404 });
      return;
    }
    reply.send(ProfilePresenter.toTacticView(profile));
  }

  async createTacticProfile(
    request: FastifyRequest<{ Body: CreateTacticProfileBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const executionMethod = request.body.executionMethod;
    if (!executionMethod) {
      reply.status(400).send({ error: 'Bad Request', message: 'executionMethod is required', statusCode: 400 });
      return;
    }

    const profile = await this.catalog.createTacticProfile({
      name: request.body.name ?? 'unnamed_tactic_profile',
      description: request.body.description,
      executionMethod,
      supportedTaskTypes: request.body.supportedTaskTypes,
      supportedLoadTiers: request.body.supportedLoadTiers,
      multiStage: request.body.multiStage,
      requiresStructuredOutput: request.body.requiresStructuredOutput,
      enabled: request.body.enabled,
    });
    reply.status(201).send(ProfilePresenter.toTacticView(profile));
  }

  async updateTacticProfile(
    request: FastifyRequest<{ Params: ProfileIdParams; Body: CreateTacticProfileBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const profile = await this.catalog.updateTacticProfile(request.params.id, request.body);
    if (!profile) {
      reply.status(404).send({ error: 'Not Found', message: `Tactic profile ${request.params.id} not found`, statusCode: 404 });
      return;
    }
    reply.send(ProfilePresenter.toTacticView(profile));
  }
}
