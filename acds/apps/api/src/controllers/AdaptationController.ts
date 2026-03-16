// ---------------------------------------------------------------------------
// AdaptationController - thin controller for adaptive optimizer read surface
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { FamilyPerformanceSummary } from '@acds/evaluation';
import type {
  AdaptationEvent,
  AdaptationRecommendation,
  CandidatePerformanceState,
  AdaptationEventFilters,
} from '@acds/adaptive-optimizer';
import { FamilyPerformancePresenter } from '../presenters/FamilyPerformancePresenter.js';
import { AdaptationEventPresenter } from '../presenters/AdaptationEventPresenter.js';

// ── Abstract reader interfaces ────────────────────────────────────────────

export interface FamilyPerformanceReader {
  listAll(): Promise<FamilyPerformanceSummary[]>;
  getByFamilyKey(familyKey: string): Promise<FamilyPerformanceSummary | null>;
}

export interface CandidateRankingReader {
  getCandidatesForFamily(familyKey: string): Promise<CandidatePerformanceState[]>;
}

export interface AdaptationEventReader {
  find(filters: AdaptationEventFilters): Promise<AdaptationEvent[]>;
}

export interface AdaptationRecommendationReader {
  listPending(): Promise<AdaptationRecommendation[]>;
}

// ── Route-level param/query types ─────────────────────────────────────────

interface FamilyKeyParams {
  familyKey: string;
}

interface AdaptationEventQuery {
  trigger?: string;
  since?: string;
  until?: string;
  limit?: string;
}

// ── Controller ────────────────────────────────────────────────────────────

export class AdaptationController {
  constructor(
    private readonly performanceReader: FamilyPerformanceReader,
    private readonly candidateReader: CandidateRankingReader,
    private readonly eventReader: AdaptationEventReader,
    private readonly recommendationReader: AdaptationRecommendationReader,
  ) {}

  // ── GET /families ───────────────────────────────────────────────────
  async listFamilies(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const summaries = await this.performanceReader.listAll();
    reply.send(FamilyPerformancePresenter.toViewList(summaries));
  }

  // ── GET /families/:familyKey ────────────────────────────────────────
  async getFamilyDetail(
    request: FastifyRequest<{ Params: FamilyKeyParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const summary = await this.performanceReader.getByFamilyKey(request.params.familyKey);
    if (!summary) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Family ${request.params.familyKey} not found`,
        statusCode: 404,
      });
      return;
    }
    reply.send(FamilyPerformancePresenter.toView(summary));
  }

  // ── GET /families/:familyKey/candidates ─────────────────────────────
  async getCandidateRankings(
    request: FastifyRequest<{ Params: FamilyKeyParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const candidates = await this.candidateReader.getCandidatesForFamily(
      request.params.familyKey,
    );
    reply.send(candidates);
  }

  // ── GET /events ─────────────────────────────────────────────────────
  async listAdaptationEvents(
    request: FastifyRequest<{ Querystring: AdaptationEventQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const q = request.query;
    const filters: AdaptationEventFilters = {
      trigger: q.trigger as AdaptationEventFilters['trigger'],
      since: q.since,
      until: q.until,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    };

    const events = await this.eventReader.find(filters);
    reply.send(AdaptationEventPresenter.toViewList(events));
  }

  // ── GET /recommendations ────────────────────────────────────────────
  async listRecommendations(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const recommendations = await this.recommendationReader.listPending();
    reply.send(recommendations);
  }
}
