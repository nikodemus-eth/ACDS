// ---------------------------------------------------------------------------
// HealthController – application and provider health endpoints
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProviderHealthService } from '@acds/provider-broker';
import { getAppConfig } from '../config/index.js';

export class HealthController {
  constructor(
    private readonly providerHealth: ProviderHealthService,
  ) {}

  // ── GET /health ─────────────────────────────────────────────────────
  async appHealth(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const config = getAppConfig();

    reply.send({
      status: 'ok',
      version: config.version,
      environment: config.nodeEnv,
      uptime: Math.floor((Date.now() - config.startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    });
  }

  // ── GET /health/providers ───────────────────────────────────────────
  async providerHealthSummary(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const healthRecords = await this.providerHealth.getAllHealth();

    const summary = {
      total: healthRecords.length,
      healthy: healthRecords.filter((h) => h.status === 'healthy').length,
      degraded: healthRecords.filter((h) => h.status === 'degraded').length,
      unhealthy: healthRecords.filter((h) => h.status === 'unhealthy').length,
      unknown: healthRecords.filter((h) => h.status === 'unknown').length,
      providers: healthRecords.map((h) => ({
        providerId: h.providerId,
        status: h.status,
        lastTestAt: h.lastTestAt?.toISOString() ?? null,
        latencyMs: h.latencyMs,
        message: h.message,
      })),
    };

    reply.send(summary);
  }
}
