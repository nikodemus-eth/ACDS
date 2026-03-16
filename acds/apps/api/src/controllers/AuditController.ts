// ---------------------------------------------------------------------------
// AuditController – thin controller delegating to an abstract query service
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuditEvent } from '@acds/audit-ledger';
import type { AuditEventType } from '@acds/core-types';
import { AuditEventPresenter } from '../presenters/AuditEventPresenter.js';

// ── Abstract reader interface ──────────────────────────────────────────────

/**
 * Read-only query service for audit events.
 * The concrete implementation lives in the infrastructure layer;
 * the controller depends only on this abstraction.
 */
export interface AuditEventReader {
  findById(id: string): Promise<AuditEvent | null>;
  find(filters: AuditListFilters): Promise<AuditEvent[]>;
}

export interface AuditListFilters {
  eventType?: AuditEventType;
  dateFrom?: Date;
  dateTo?: Date;
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  application?: string;
  limit?: number;
  offset?: number;
}

// ── Route-level query types ────────────────────────────────────────────────

interface AuditIdParams {
  id: string;
}

interface AuditListQuery {
  eventType?: AuditEventType;
  dateFrom?: string;
  dateTo?: string;
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  application?: string;
  limit?: number;
  offset?: number;
}

// ── Controller ─────────────────────────────────────────────────────────────

export class AuditController {
  constructor(
    private readonly reader: AuditEventReader,
  ) {}

  // ── GET / ────────────────────────────────────────────────────────────
  /**
   * Lists audit events with optional filters:
   * eventType, dateRange, actor, resourceType, resourceId, application.
   */
  async list(
    request: FastifyRequest<{ Querystring: AuditListQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const q = request.query;

    const filters: AuditListFilters = {
      eventType: q.eventType,
      actor: q.actor,
      resourceType: q.resourceType,
      resourceId: q.resourceId,
      application: q.application,
      limit: q.limit,
      offset: q.offset,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    };

    const events = await this.reader.find(filters);
    reply.send(AuditEventPresenter.toViewList(events));
  }

  // ── GET /:id ─────────────────────────────────────────────────────────
  /**
   * Retrieves a single audit event by ID.
   */
  async getById(
    request: FastifyRequest<{ Params: AuditIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const event = await this.reader.findById(request.params.id);
    if (!event) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Audit event ${request.params.id} not found`,
        statusCode: 404,
      });
      return;
    }
    reply.send(AuditEventPresenter.toView(event));
  }
}
