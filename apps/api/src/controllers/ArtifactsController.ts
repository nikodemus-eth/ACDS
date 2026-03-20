// ---------------------------------------------------------------------------
// ArtifactsController – read-only catalog of artifact registry entries
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ArtifactRegistry } from '@acds/sovereign-runtime';
import { ArtifactPresenter } from '../presenters/ArtifactPresenter.js';

interface ArtifactTypeParams {
  artifactType: string;
}

interface FamilyParams {
  family: string;
}

export class ArtifactsController {
  constructor(private readonly registry: ArtifactRegistry) {}

  // ── GET / ────────────────────────────────────────────────────────────
  async list(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const entries = this.registry.getAllEntries();
    reply.send(ArtifactPresenter.toViewList(entries));
  }

  // ── GET /families ────────────────────────────────────────────────────
  async listFamilies(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const families = this.registry.families;
    const familyMap = new Map<string, ReturnType<typeof this.registry.getEntriesByFamily>>();
    for (const family of families) {
      familyMap.set(family, this.registry.getEntriesByFamily(family));
    }
    reply.send(ArtifactPresenter.toFamilySummaryList(familyMap));
  }

  // ── GET /families/:family ────────────────────────────────────────────
  async getFamily(
    request: FastifyRequest<{ Params: FamilyParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const entries = this.registry.getEntriesByFamily(request.params.family);
    if (entries.length === 0) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Family "${request.params.family}" not found`,
        statusCode: 404,
      });
      return;
    }
    reply.send({
      family: request.params.family,
      entries: ArtifactPresenter.toViewList(entries),
    });
  }

  // ── GET /:artifactType ──────────────────────────────────────────────
  async getByType(
    request: FastifyRequest<{ Params: ArtifactTypeParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const entry = this.registry.getEntry(request.params.artifactType);
    if (!entry) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Artifact type "${request.params.artifactType}" not found`,
        statusCode: 404,
      });
      return;
    }
    reply.send(ArtifactPresenter.toView(entry));
  }

  // ── GET /stats ──────────────────────────────────────────────────────
  async stats(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const entries = this.registry.getAllEntries();
    const families = this.registry.families;

    const dispositionCounts: Record<string, number> = {};
    const modalityCounts: Record<string, number> = {};
    const qualityTierCounts: Record<string, number> = {};

    for (const entry of entries) {
      dispositionCounts[entry.provider_disposition] = (dispositionCounts[entry.provider_disposition] ?? 0) + 1;
      modalityCounts[entry.output_modality] = (modalityCounts[entry.output_modality] ?? 0) + 1;
      qualityTierCounts[entry.quality_tier] = (qualityTierCounts[entry.quality_tier] ?? 0) + 1;
    }

    reply.send({
      total_artifacts: entries.length,
      total_families: families.length,
      families,
      by_disposition: dispositionCounts,
      by_modality: modalityCounts,
      by_quality_tier: qualityTierCounts,
    });
  }
}
