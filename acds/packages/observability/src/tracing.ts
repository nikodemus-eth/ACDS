// ---------------------------------------------------------------------------
// OpenTelemetry-compatible tracing abstractions
// ---------------------------------------------------------------------------
// These interfaces allow the ACDS codebase to instrument spans without
// depending directly on @opentelemetry/* packages.  Concrete implementations
// are wired at application bootstrap.
// ---------------------------------------------------------------------------

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Represents an active trace span.
 */
export interface Span {
  /** Set a key-value attribute on the span. */
  setAttribute(key: string, value: string | number | boolean): void;

  /** Record an error on the span. */
  recordException(error: Error): void;

  /** Mark the span as ended (stops the clock). */
  end(): void;
}

/**
 * A tracer capable of creating child spans.
 */
export interface Tracer {
  /** Start a new span with the given name and optional attributes. */
  startSpan(name: string, attributes?: SpanAttributes): Span;
}

/**
 * Factory that returns named tracers (mirrors OTel TracerProvider).
 */
export interface TracerProvider {
  getTracer(name: string, version?: string): Tracer;
}

// ---------------------------------------------------------------------------
// Pre-defined span names used throughout ACDS
// ---------------------------------------------------------------------------

export const SpanNames = {
  ROUTING_RESOLVE: 'acds.routing.resolve',
  ROUTING_ELIGIBILITY: 'acds.routing.eligibility',
  ROUTING_SELECTION: 'acds.routing.selection',
  EXECUTION_RUN: 'acds.execution.run',
  EXECUTION_FALLBACK: 'acds.execution.fallback',
  PROVIDER_CALL: 'acds.provider.call',
  EVALUATION_SCORE: 'acds.evaluation.score',
  ADAPTATION_RECOMMEND: 'acds.adaptation.recommend',
  ADAPTATION_APPLY: 'acds.adaptation.apply',
  PLATEAU_DETECT: 'acds.plateau.detect',
} as const;

// ---------------------------------------------------------------------------
// No-op tracer (useful for tests and environments without tracing)
// ---------------------------------------------------------------------------

function createNoopSpan(): Span {
  return {
    setAttribute: () => {},
    recordException: () => {},
    end: () => {},
  };
}

function createNoopTracer(): Tracer {
  return {
    startSpan: () => createNoopSpan(),
  };
}

export function createNoopTracerProvider(): TracerProvider {
  return {
    getTracer: () => createNoopTracer(),
  };
}
