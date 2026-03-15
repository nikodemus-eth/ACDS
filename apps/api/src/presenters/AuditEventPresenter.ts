// ---------------------------------------------------------------------------
// AuditEventPresenter – formats audit events for API responses
// ---------------------------------------------------------------------------

import type { AuditEvent } from '@acds/audit-ledger';

/**
 * Public shape returned to API clients.
 * Formats normalised audit events safely – never exposes secrets,
 * credentials, or raw internal error stacks in details.
 */
export interface AuditEventView {
  id: string;
  eventType: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  application: string | null;
  details: Record<string, unknown>;
  timestamp: string;
}

/** Keys that must never appear in the public details payload. */
const REDACTED_DETAIL_KEYS: ReadonlySet<string> = new Set([
  'apiKey',
  'apiSecret',
  'secret',
  'secretKey',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'credentials',
  'connectionString',
]);

export class AuditEventPresenter {
  /**
   * Formats a single AuditEvent for the API response.
   * Redacts any detail keys that could leak secrets.
   */
  static toView(event: AuditEvent): AuditEventView {
    return {
      id: event.id,
      eventType: event.eventType,
      actor: event.actor,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      application: event.application,
      details: AuditEventPresenter.redactDetails(event.details),
      timestamp: event.timestamp.toISOString(),
    };
  }

  /**
   * Formats a list of AuditEvent entities.
   */
  static toViewList(events: AuditEvent[]): AuditEventView[] {
    return events.map(AuditEventPresenter.toView);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Shallow-redacts known secret keys from the details object.
   */
  private static redactDetails(
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details)) {
      if (REDACTED_DETAIL_KEYS.has(key)) {
        safe[key] = '[REDACTED]';
      } else {
        safe[key] = value;
      }
    }
    return safe;
  }
}
