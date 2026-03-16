// ---------------------------------------------------------------------------
// Prometheus-compatible metric abstractions
// ---------------------------------------------------------------------------
// These interfaces define the shape of metrics without binding to a specific
// implementation (prom-client, StatsD, etc.).  Consumers wire concrete
// implementations at application bootstrap.
// ---------------------------------------------------------------------------

/**
 * Labels attached to the `acds_requests_total` counter.
 */
export interface RequestLabels {
  [key: string]: string;
  application: string;
  process: string;
  status: 'success' | 'error' | 'timeout';
}

/**
 * Labels attached to the `acds_request_duration_ms` histogram.
 */
export interface RequestDurationLabels {
  [key: string]: string;
  application: string;
  process: string;
}

/**
 * Labels attached to the `acds_routing_decisions_total` counter.
 */
export interface RoutingDecisionLabels {
  [key: string]: string;
  application: string;
  outcome: 'primary' | 'fallback' | 'rejected';
}

/**
 * Labels attached to the `acds_execution_errors_total` counter.
 */
export interface ExecutionErrorLabels {
  [key: string]: string;
  provider: string;
  error_type: 'timeout' | 'network' | 'server_error' | 'rate_limit' | 'unknown';
}

/**
 * Labels attached to the `acds_adaptive_events_total` counter.
 */
export interface AdaptiveEventLabels {
  [key: string]: string;
  family: string;
  event_type: 'recommendation' | 'approval' | 'auto_apply' | 'rollback' | 'plateau';
}

// ---------------------------------------------------------------------------
// Abstract metric primitives
// ---------------------------------------------------------------------------

/**
 * A monotonically increasing counter.
 */
export interface Counter<L extends Record<string, string>> {
  inc(labels: L, value?: number): void;
}

/**
 * A histogram that records observed values into configurable buckets.
 */
export interface Histogram<L extends Record<string, string>> {
  observe(labels: L, value: number): void;
}

// ---------------------------------------------------------------------------
// Metric registry — the single object wired at bootstrap
// ---------------------------------------------------------------------------

export interface AcdsMetrics {
  /** Total inbound dispatch requests. */
  readonly requestsTotal: Counter<RequestLabels>;

  /** Request duration in milliseconds. */
  readonly requestDurationMs: Histogram<RequestDurationLabels>;

  /** Total routing decisions made. */
  readonly routingDecisionsTotal: Counter<RoutingDecisionLabels>;

  /** Total execution errors by provider and error type. */
  readonly executionErrorsTotal: Counter<ExecutionErrorLabels>;

  /** Total adaptive-loop events by family and event type. */
  readonly adaptiveEventsTotal: Counter<AdaptiveEventLabels>;
}

// ---------------------------------------------------------------------------
// No-op implementation (useful for tests and environments without metrics)
// ---------------------------------------------------------------------------

function noopCounter<L extends Record<string, string>>(): Counter<L> {
  return { inc: () => {} };
}

function noopHistogram<L extends Record<string, string>>(): Histogram<L> {
  return { observe: () => {} };
}

export function createNoopMetrics(): AcdsMetrics {
  return {
    requestsTotal: noopCounter<RequestLabels>(),
    requestDurationMs: noopHistogram<RequestDurationLabels>(),
    routingDecisionsTotal: noopCounter<RoutingDecisionLabels>(),
    executionErrorsTotal: noopCounter<ExecutionErrorLabels>(),
    adaptiveEventsTotal: noopCounter<AdaptiveEventLabels>(),
  };
}
