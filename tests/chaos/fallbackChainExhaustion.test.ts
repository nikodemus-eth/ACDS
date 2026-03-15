// ---------------------------------------------------------------------------
// Chaos Tests — Fallback Chain Exhaustion
// ---------------------------------------------------------------------------
// Every provider in the fallback chain fails, forcing the system to surface
// a structured error rather than silently dropping the request.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FailureKind = 'timeout' | 'network_error' | 'server_error' | 'rate_limit';

interface ProviderAttempt {
  provider: string;
  failureKind: FailureKind;
  message: string;
}

interface ExhaustedDispatchResult {
  success: false;
  attempts: ProviderAttempt[];
  exhausted: true;
  errorSummary: string;
}



interface FallbackProvider {
  name: string;
  failureKind: FailureKind;
}

// ---------------------------------------------------------------------------
// Dispatch logic that exhausts the full chain
// ---------------------------------------------------------------------------

function dispatchWithExhaustibleChain(
  providers: FallbackProvider[],
): ExhaustedDispatchResult {
  const attempts: ProviderAttempt[] = [];

  for (const provider of providers) {
    const message = buildErrorMessage(provider.name, provider.failureKind);
    attempts.push({
      provider: provider.name,
      failureKind: provider.failureKind,
      message,
    });
  }

  // All providers failed — chain is exhausted
  const failureKinds = [...new Set(attempts.map((a) => a.failureKind))];
  const errorSummary =
    `All ${attempts.length} provider(s) in the fallback chain failed. ` +
    `Failure types: ${failureKinds.join(', ')}.`;

  return {
    success: false,
    attempts,
    exhausted: true,
    errorSummary,
  };
}

function buildErrorMessage(provider: string, kind: FailureKind): string {
  switch (kind) {
    case 'timeout':
      return `${provider}: request timed out`;
    case 'network_error':
      return `${provider}: ECONNREFUSED`;
    case 'server_error':
      return `${provider}: HTTP 500`;
    case 'rate_limit':
      return `${provider}: HTTP 429 Too Many Requests`;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Fallback Chain Exhaustion — All providers fail', () => {
  it('returns exhausted result when single provider fails', () => {
    const result = dispatchWithExhaustibleChain([
      { name: 'ollama-only', failureKind: 'timeout' },
    ]);

    expect(result.success).toBe(false);
    expect(result.exhausted).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.errorSummary).toContain('1 provider(s)');
  });

  it('returns exhausted result when all providers in a 3-node chain fail', () => {
    const result = dispatchWithExhaustibleChain([
      { name: 'ollama-primary', failureKind: 'timeout' },
      { name: 'lmstudio-secondary', failureKind: 'network_error' },
      { name: 'openai-tertiary', failureKind: 'server_error' },
    ]);

    expect(result.success).toBe(false);
    expect(result.exhausted).toBe(true);
    expect(result.attempts).toHaveLength(3);
    expect(result.errorSummary).toContain('3 provider(s)');
  });

  it('lists all distinct failure types in the error summary', () => {
    const result = dispatchWithExhaustibleChain([
      { name: 'a', failureKind: 'timeout' },
      { name: 'b', failureKind: 'rate_limit' },
      { name: 'c', failureKind: 'timeout' },
    ]);

    expect(result.errorSummary).toContain('timeout');
    expect(result.errorSummary).toContain('rate_limit');
  });

  it('preserves attempt order for auditing', () => {
    const providers: FallbackProvider[] = [
      { name: 'first', failureKind: 'network_error' },
      { name: 'second', failureKind: 'server_error' },
      { name: 'third', failureKind: 'rate_limit' },
      { name: 'fourth', failureKind: 'timeout' },
    ];

    const result = dispatchWithExhaustibleChain(providers);

    expect(result.attempts.map((a) => a.provider)).toEqual([
      'first',
      'second',
      'third',
      'fourth',
    ]);
  });

  it('includes per-provider error messages', () => {
    const result = dispatchWithExhaustibleChain([
      { name: 'ollama', failureKind: 'timeout' },
      { name: 'openai', failureKind: 'rate_limit' },
    ]);

    expect(result.attempts[0].message).toContain('timed out');
    expect(result.attempts[1].message).toContain('429');
  });
});

describe('Fallback Chain Exhaustion — Mixed failure scenarios', () => {
  it('handles a chain where every provider hits rate limits', () => {
    const result = dispatchWithExhaustibleChain([
      { name: 'openai-1', failureKind: 'rate_limit' },
      { name: 'openai-2', failureKind: 'rate_limit' },
      { name: 'gemini-1', failureKind: 'rate_limit' },
    ]);

    expect(result.success).toBe(false);
    expect(result.exhausted).toBe(true);
    expect(result.errorSummary).toContain('rate_limit');
    // Only one distinct failure type
    expect(result.errorSummary).not.toContain('timeout');
  });

  it('handles an empty fallback chain gracefully', () => {
    const result = dispatchWithExhaustibleChain([]);

    expect(result.success).toBe(false);
    expect(result.exhausted).toBe(true);
    expect(result.attempts).toHaveLength(0);
    expect(result.errorSummary).toContain('0 provider(s)');
  });
});
