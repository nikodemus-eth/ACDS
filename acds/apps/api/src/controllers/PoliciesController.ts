import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApplicationPolicy, GlobalPolicy, ProcessPolicy } from '@acds/policy-engine';
import { type ProviderVendor } from '@acds/core-types';
import type { PgPolicyRepository } from '@acds/persistence-pg';
import { PolicyPresenter, type PolicyPayloadView } from '../presenters/PolicyPresenter.js';

interface PolicyIdParams {
  id: string;
}

interface PolicyListQuery {
  level?: 'global' | 'application' | 'process';
}

export class PoliciesController {
  constructor(private readonly repository: PgPolicyRepository) {}

  private toVendors(vendors?: string[] | null): ProviderVendor[] | null {
    if (vendors == null) return null;
    return vendors as ProviderVendor[];
  }

  async list(
    request: FastifyRequest<{ Querystring: PolicyListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const level = request.query.level;
    const globalPolicy = level && level !== 'global' ? null : await this.repository.getGlobalPolicy();
    const applicationPolicies = level && level !== 'application' ? [] : await this.repository.listApplicationPolicies();
    const processPolicies = level && level !== 'process' ? [] : await this.repository.listProcessPolicies();

    reply.send([
      ...(globalPolicy ? [PolicyPresenter.fromGlobal(globalPolicy)] : []),
      ...applicationPolicies.map((policy) => PolicyPresenter.fromApplication(policy)),
      ...processPolicies.map((policy) => PolicyPresenter.fromProcess(policy)),
    ]);
  }

  async getById(
    request: FastifyRequest<{ Params: PolicyIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const id = request.params.id;
    const globalPolicy = await this.repository.getGlobalPolicy();
    if (globalPolicy?.id === id) {
      reply.send(PolicyPresenter.fromGlobal(globalPolicy));
      return;
    }

    const applicationPolicy = await this.repository.findApplicationPolicyById(id);
    if (applicationPolicy) {
      reply.send(PolicyPresenter.fromApplication(applicationPolicy));
      return;
    }

    const processPolicy = await this.repository.findProcessPolicyById(id);
    if (processPolicy) {
      reply.send(PolicyPresenter.fromProcess(processPolicy));
      return;
    }

    reply.status(404).send({ error: 'Not Found', message: `Policy ${id} not found`, statusCode: 404 });
  }

  async create(
    request: FastifyRequest<{ Body: PolicyPayloadView }>,
    reply: FastifyReply,
  ): Promise<void> {
    const payload = request.body;
    const id = randomUUID();

    if (payload.level === 'global') {
      const policy: GlobalPolicy = {
        id,
        allowedVendors: this.toVendors(payload.allowedVendors) ?? [],
        blockedVendors: this.toVendors(payload.blockedVendors) ?? [],
        defaultPrivacy: (payload.defaults?.privacy ?? 'cloud_allowed') as GlobalPolicy['defaultPrivacy'],
        defaultCostSensitivity: (payload.defaults?.costSensitivity ?? 'medium') as GlobalPolicy['defaultCostSensitivity'],
        structuredOutputRequiredForGrades: (payload.constraints?.structuredOutputRequiredForGrades ?? []) as GlobalPolicy['structuredOutputRequiredForGrades'],
        traceabilityRequiredForGrades: (payload.constraints?.traceabilityRequiredForGrades ?? []) as GlobalPolicy['traceabilityRequiredForGrades'],
        maxLatencyMsByLoadTier: (payload.constraints?.maxLatencyMsByLoadTier ?? {}) as GlobalPolicy['maxLatencyMsByLoadTier'],
        localPreferredTaskTypes: (payload.defaults?.localPreferredTaskTypes ?? []) as GlobalPolicy['localPreferredTaskTypes'],
        cloudRequiredLoadTiers: (payload.constraints?.cloudRequiredLoadTiers ?? []) as GlobalPolicy['cloudRequiredLoadTiers'],
        enabled: payload.enabled ?? true,
        updatedAt: new Date(),
      };
      await this.repository.saveGlobalPolicy(policy);
      reply.status(201).send(PolicyPresenter.fromGlobal(policy));
      return;
    }

    if (payload.level === 'application') {
      const policy: ApplicationPolicy = {
        id,
        application: payload.application ?? 'unknown_application',
        allowedVendors: this.toVendors(payload.allowedVendors),
        blockedVendors: this.toVendors(payload.blockedVendors),
        privacyOverride: (payload.defaults?.privacyOverride ?? null) as ApplicationPolicy['privacyOverride'],
        costSensitivityOverride: (payload.defaults?.costSensitivityOverride ?? null) as ApplicationPolicy['costSensitivityOverride'],
        preferredModelProfileIds: (payload.defaults?.preferredModelProfileIds ?? null) as ApplicationPolicy['preferredModelProfileIds'],
        blockedModelProfileIds: (payload.constraints?.blockedModelProfileIds ?? null) as ApplicationPolicy['blockedModelProfileIds'],
        localPreferredTaskTypes: (payload.defaults?.localPreferredTaskTypes ?? null) as ApplicationPolicy['localPreferredTaskTypes'],
        structuredOutputRequiredForGrades: (payload.constraints?.structuredOutputRequiredForGrades ?? null) as ApplicationPolicy['structuredOutputRequiredForGrades'],
        enabled: payload.enabled ?? true,
        updatedAt: new Date(),
      };
      await this.repository.saveApplicationPolicy(policy);
      reply.status(201).send(PolicyPresenter.fromApplication(policy));
      return;
    }

    const policy: ProcessPolicy = {
      id,
      application: payload.application ?? 'unknown_application',
      process: payload.process ?? 'unknown_process',
      step: (payload.constraints?.step ?? null) as ProcessPolicy['step'],
      defaultModelProfileId: (payload.defaults?.defaultModelProfileId ?? null) as ProcessPolicy['defaultModelProfileId'],
      defaultTacticProfileId: (payload.defaults?.defaultTacticProfileId ?? null) as ProcessPolicy['defaultTacticProfileId'],
      allowedModelProfileIds: (payload.constraints?.allowedModelProfileIds ?? null) as ProcessPolicy['allowedModelProfileIds'],
      blockedModelProfileIds: (payload.constraints?.blockedModelProfileIds ?? null) as ProcessPolicy['blockedModelProfileIds'],
      allowedTacticProfileIds: (payload.constraints?.allowedTacticProfileIds ?? null) as ProcessPolicy['allowedTacticProfileIds'],
      privacyOverride: (payload.defaults?.privacyOverride ?? null) as ProcessPolicy['privacyOverride'],
      costSensitivityOverride: (payload.defaults?.costSensitivityOverride ?? null) as ProcessPolicy['costSensitivityOverride'],
      forceEscalationForGrades: (payload.constraints?.forceEscalationForGrades ?? null) as ProcessPolicy['forceEscalationForGrades'],
      enabled: payload.enabled ?? true,
      updatedAt: new Date(),
    };
    await this.repository.saveProcessPolicy(policy);
    reply.status(201).send(PolicyPresenter.fromProcess(policy));
  }

  async update(
    request: FastifyRequest<{ Params: PolicyIdParams; Body: PolicyPayloadView }>,
    reply: FastifyReply,
  ): Promise<void> {
    const current = await this.resolvePolicy(request.params.id);
    if (!current) {
      reply.status(404).send({ error: 'Not Found', message: `Policy ${request.params.id} not found`, statusCode: 404 });
      return;
    }

    const payload = request.body;
    if (current.kind === 'global') {
      const updated: GlobalPolicy = {
        ...current.policy,
        allowedVendors: this.toVendors(payload.allowedVendors) ?? current.policy.allowedVendors,
        blockedVendors: this.toVendors(payload.blockedVendors) ?? current.policy.blockedVendors,
        defaultPrivacy: (payload.defaults?.privacy ?? current.policy.defaultPrivacy) as GlobalPolicy['defaultPrivacy'],
        defaultCostSensitivity: (payload.defaults?.costSensitivity ?? current.policy.defaultCostSensitivity) as GlobalPolicy['defaultCostSensitivity'],
        structuredOutputRequiredForGrades: (payload.constraints?.structuredOutputRequiredForGrades ?? current.policy.structuredOutputRequiredForGrades) as GlobalPolicy['structuredOutputRequiredForGrades'],
        traceabilityRequiredForGrades: (payload.constraints?.traceabilityRequiredForGrades ?? current.policy.traceabilityRequiredForGrades) as GlobalPolicy['traceabilityRequiredForGrades'],
        maxLatencyMsByLoadTier: (payload.constraints?.maxLatencyMsByLoadTier ?? current.policy.maxLatencyMsByLoadTier) as GlobalPolicy['maxLatencyMsByLoadTier'],
        localPreferredTaskTypes: (payload.defaults?.localPreferredTaskTypes ?? current.policy.localPreferredTaskTypes) as GlobalPolicy['localPreferredTaskTypes'],
        cloudRequiredLoadTiers: (payload.constraints?.cloudRequiredLoadTiers ?? current.policy.cloudRequiredLoadTiers) as GlobalPolicy['cloudRequiredLoadTiers'],
        enabled: payload.enabled ?? current.policy.enabled,
        updatedAt: new Date(),
      };
      await this.repository.saveGlobalPolicy(updated);
      reply.send(PolicyPresenter.fromGlobal(updated));
      return;
    }

    if (current.kind === 'application') {
      const updated: ApplicationPolicy = {
        ...current.policy,
        application: payload.application ?? current.policy.application,
        allowedVendors: this.toVendors(payload.allowedVendors) ?? current.policy.allowedVendors,
        blockedVendors: this.toVendors(payload.blockedVendors) ?? current.policy.blockedVendors,
        privacyOverride: (payload.defaults?.privacyOverride ?? current.policy.privacyOverride) as ApplicationPolicy['privacyOverride'],
        costSensitivityOverride: (payload.defaults?.costSensitivityOverride ?? current.policy.costSensitivityOverride) as ApplicationPolicy['costSensitivityOverride'],
        preferredModelProfileIds: (payload.defaults?.preferredModelProfileIds ?? current.policy.preferredModelProfileIds) as ApplicationPolicy['preferredModelProfileIds'],
        blockedModelProfileIds: (payload.constraints?.blockedModelProfileIds ?? current.policy.blockedModelProfileIds) as ApplicationPolicy['blockedModelProfileIds'],
        localPreferredTaskTypes: (payload.defaults?.localPreferredTaskTypes ?? current.policy.localPreferredTaskTypes) as ApplicationPolicy['localPreferredTaskTypes'],
        structuredOutputRequiredForGrades: (payload.constraints?.structuredOutputRequiredForGrades ?? current.policy.structuredOutputRequiredForGrades) as ApplicationPolicy['structuredOutputRequiredForGrades'],
        enabled: payload.enabled ?? current.policy.enabled,
        updatedAt: new Date(),
      };
      await this.repository.saveApplicationPolicy(updated);
      reply.send(PolicyPresenter.fromApplication(updated));
      return;
    }

    const updated: ProcessPolicy = {
      ...current.policy,
      application: payload.application ?? current.policy.application,
      process: payload.process ?? current.policy.process,
      step: (payload.constraints?.step ?? current.policy.step) as ProcessPolicy['step'],
      defaultModelProfileId: (payload.defaults?.defaultModelProfileId ?? current.policy.defaultModelProfileId) as ProcessPolicy['defaultModelProfileId'],
      defaultTacticProfileId: (payload.defaults?.defaultTacticProfileId ?? current.policy.defaultTacticProfileId) as ProcessPolicy['defaultTacticProfileId'],
      allowedModelProfileIds: (payload.constraints?.allowedModelProfileIds ?? current.policy.allowedModelProfileIds) as ProcessPolicy['allowedModelProfileIds'],
      blockedModelProfileIds: (payload.constraints?.blockedModelProfileIds ?? current.policy.blockedModelProfileIds) as ProcessPolicy['blockedModelProfileIds'],
      allowedTacticProfileIds: (payload.constraints?.allowedTacticProfileIds ?? current.policy.allowedTacticProfileIds) as ProcessPolicy['allowedTacticProfileIds'],
      privacyOverride: (payload.defaults?.privacyOverride ?? current.policy.privacyOverride) as ProcessPolicy['privacyOverride'],
      costSensitivityOverride: (payload.defaults?.costSensitivityOverride ?? current.policy.costSensitivityOverride) as ProcessPolicy['costSensitivityOverride'],
      forceEscalationForGrades: (payload.constraints?.forceEscalationForGrades ?? current.policy.forceEscalationForGrades) as ProcessPolicy['forceEscalationForGrades'],
      enabled: payload.enabled ?? current.policy.enabled,
      updatedAt: new Date(),
    };
    await this.repository.saveProcessPolicy(updated);
    reply.send(PolicyPresenter.fromProcess(updated));
  }

  async remove(
    request: FastifyRequest<{ Params: PolicyIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const current = await this.resolvePolicy(request.params.id);
    if (!current) {
      reply.status(404).send({ error: 'Not Found', message: `Policy ${request.params.id} not found`, statusCode: 404 });
      return;
    }

    if (current.kind === 'global') {
      reply.status(405).send({ error: 'Method Not Allowed', message: 'Global policy deletion is not supported', statusCode: 405 });
      return;
    }

    if (current.kind === 'application') {
      await this.repository.deleteApplicationPolicy(current.policy.id);
    } else {
      await this.repository.deleteProcessPolicy(current.policy.id);
    }

    reply.status(204).send();
  }

  private async resolvePolicy(id: string): Promise<
    | { kind: 'global'; policy: GlobalPolicy }
    | { kind: 'application'; policy: ApplicationPolicy }
    | { kind: 'process'; policy: ProcessPolicy }
    | null
  > {
    const globalPolicy = await this.repository.getGlobalPolicy();
    if (globalPolicy?.id === id) return { kind: 'global', policy: globalPolicy };

    const applicationPolicy = await this.repository.findApplicationPolicyById(id);
    if (applicationPolicy) return { kind: 'application', policy: applicationPolicy };

    const processPolicy = await this.repository.findProcessPolicyById(id);
    if (processPolicy) return { kind: 'process', policy: processPolicy };

    return null;
  }
}
