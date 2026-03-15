/**
 * LeaseManager - Manages the lifecycle of execution leases including
 * minting, validation, revocation, and cleanup.
 */

import { randomUUID } from 'node:crypto';
import type { ExecutionLease } from './ExecutionLease.js';

export interface LeaseConfig {
  /** Default time-to-live in milliseconds (default: 300_000 / 5 min). */
  defaultTtlMs: number;
  /** Maximum allowed TTL in milliseconds (default: 3_600_000 / 1 hour). */
  maxTtlMs: number;
  /** Default maximum requests per lease (default: 100). */
  defaultMaxRequests: number;
  /** Default maximum tokens per lease (default: 1_000_000). */
  defaultMaxTokens: number;
}

const DEFAULT_CONFIG: LeaseConfig = {
  defaultTtlMs: 300_000,
  maxTtlMs: 3_600_000,
  defaultMaxRequests: 100,
  defaultMaxTokens: 1_000_000,
};

export class LeaseManager {
  private readonly leases = new Map<string, ExecutionLease>();
  private readonly config: LeaseConfig;

  constructor(config?: Partial<LeaseConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Mints a new lease for the specified provider with the given scope
   * and optional usage limits.
   */
  mint(
    providerId: string,
    capabilityScope: string[],
    ttlMs?: number,
    usageLimits?: Partial<ExecutionLease['usageLimits']>,
  ): ExecutionLease {
    const ttl = Math.min(ttlMs ?? this.config.defaultTtlMs, this.config.maxTtlMs);
    const lease: ExecutionLease = {
      leaseId: randomUUID(),
      providerId,
      capabilityScope,
      expiresAt: new Date(Date.now() + ttl),
      usageLimits: {
        maxRequests: usageLimits?.maxRequests ?? this.config.defaultMaxRequests,
        maxTokens: usageLimits?.maxTokens ?? this.config.defaultMaxTokens,
      },
      issuedAt: new Date(),
    };
    this.leases.set(lease.leaseId, lease);
    return lease;
  }

  /**
   * Validates a lease by ID. Returns the lease if valid, or null if
   * expired, revoked, or not found.
   */
  validate(leaseId: string): ExecutionLease | null {
    const lease = this.leases.get(leaseId);
    if (!lease) return null;
    if (lease.revokedAt) return null;
    if (new Date() > lease.expiresAt) {
      this.leases.delete(leaseId);
      return null;
    }
    return lease;
  }

  /**
   * Revokes a lease before its natural expiry.
   */
  revoke(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;
    lease.revokedAt = new Date();
    return true;
  }

  /**
   * Removes expired and revoked leases from the internal store.
   * Returns the number of leases cleaned up.
   */
  cleanup(): number {
    const now = new Date();
    let cleaned = 0;
    for (const [id, lease] of this.leases) {
      if (now > lease.expiresAt || lease.revokedAt) {
        this.leases.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
