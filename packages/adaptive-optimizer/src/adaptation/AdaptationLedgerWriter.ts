/**
 * AdaptationLedgerWriter - Abstract persistence interface for the
 * adaptation event ledger.
 *
 * The ledger provides an append-only audit trail of all adaptation
 * events applied by the optimizer. Implementations may back this
 * with a database, event store, or file system.
 */

import type { AdaptationEvent, AdaptationTrigger } from './AdaptationEventBuilder.js';

export interface AdaptationEventFilters {
  /** Filter by adaptation trigger type. */
  trigger?: AdaptationTrigger;

  /** Filter events created on or after this ISO-8601 timestamp. */
  since?: string;

  /** Filter events created on or before this ISO-8601 timestamp. */
  until?: string;

  /** Maximum number of events to return. */
  limit?: number;
}

export interface AdaptationLedgerWriter {
  /**
   * Appends an adaptation event to the ledger.
   */
  writeEvent(event: AdaptationEvent): Promise<void>;

  /**
   * Lists adaptation events for a family, optionally filtered.
   */
  listEvents(familyKey: string, filters?: AdaptationEventFilters): Promise<AdaptationEvent[]>;

  /**
   * Retrieves a single adaptation event by its unique identifier.
   * Returns undefined if no event with the given id exists.
   */
  getEvent(id: string): Promise<AdaptationEvent | undefined>;
}
