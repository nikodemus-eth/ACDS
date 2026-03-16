// ---------------------------------------------------------------------------
// Chaos Tests — Provider Failure Injection
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FailureKind = 'timeout' | 'network_error' | 'server_error';

interface ProviderCallResult {
  success: boolean;
  output?: string;
  error?: { kind: FailureKind; message: string };
  latencyMs: number;
}

interface MockProviderConfig {
  name: string;
  failureKind: FailureKind | null;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Mock provider that simulates various failure modes
// ---------------------------------------------------------------------------

function callMockProvider(config: MockProviderConfig): ProviderCallResult {
  if (config.failureKind === 'timeout') {
    return {
      success: false,
      error: { kind: 'timeout', message: `Provider ${config.name} timed out after ${config.latencyMs}ms` },
      latencyMs: config.latencyMs,
    };
  }

  if (config.failureKind === 'network_error') {
    return {
      success: false,
      error: { kind: 'network_error', message: `Provider ${config.name}: ECONNREFUSED` },
      latencyMs: 0,
    };
  }

  if (config.failureKind === 'server_error') {
    return {
      success: false,
      error: { kind: 'server_error', message: `Provider ${config.name}: 500 Internal Server Error` },
      latencyMs: config.latencyMs,
    };
  }

  return {
    success: true,
    output: `Response from ${config.name}`,
    latencyMs: config.latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Dispatch with fallback chain
// ---------------------------------------------------------------------------

interface DispatchResult {
  success: boolean;
  provider: string;
  output?: string;
  attempts: { provider: string; error?: string }[];
}

function dispatchWithFallback(
  chain: MockProviderConfig[],
): DispatchResult {
  const attempts: { provider: string; error?: string }[] = [];

  for (const provider of chain) {
    const result = callMockProvider(provider);
    if (result.success) {
      attempts.push({ provider: provider.name });
      return {
        success: true,
        provider: provider.name,
        output: result.output,
        attempts,
      };
    }
    attempts.push({ provider: provider.name, error: result.error?.message });
  }

  return {
    success: false,
    provider: chain[chain.length - 1].name,
    attempts,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Provider Failure Injection — Timeout', () => {
  it('falls back to next provider when primary times out', () => {
    const chain: MockProviderConfig[] = [
      { name: 'ollama-primary', failureKind: 'timeout', latencyMs: 5000 },
      { name: 'lmstudio-secondary', failureKind: null, latencyMs: 200 },
    ];

    const result = dispatchWithFallback(chain);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('lmstudio-secondary');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].error).toContain('timed out');
  });

  it('records timeout details in the attempt log', () => {
    const chain: MockProviderConfig[] = [
      { name: 'openai-primary', failureKind: 'timeout', latencyMs: 30000 },
      { name: 'gemini-fallback', failureKind: null, latencyMs: 400 },
    ];

    const result = dispatchWithFallback(chain);

    expect(result.attempts[0].error).toContain('30000ms');
  });
});

describe('Provider Failure Injection — Network Error', () => {
  it('falls back when provider is unreachable', () => {
    const chain: MockProviderConfig[] = [
      { name: 'ollama-primary', failureKind: 'network_error', latencyMs: 0 },
      { name: 'gemini-fallback', failureKind: null, latencyMs: 350 },
    ];

    const result = dispatchWithFallback(chain);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('gemini-fallback');
    expect(result.attempts[0].error).toContain('ECONNREFUSED');
  });

  it('propagates network error when it is the only provider', () => {
    const chain: MockProviderConfig[] = [
      { name: 'ollama-only', failureKind: 'network_error', latencyMs: 0 },
    ];

    const result = dispatchWithFallback(chain);

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(1);
  });
});

describe('Provider Failure Injection — Server Error', () => {
  it('falls back when provider returns 500', () => {
    const chain: MockProviderConfig[] = [
      { name: 'openai-primary', failureKind: 'server_error', latencyMs: 100 },
      { name: 'gemini-secondary', failureKind: null, latencyMs: 300 },
    ];

    const result = dispatchWithFallback(chain);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('gemini-secondary');
    expect(result.attempts[0].error).toContain('500');
  });

  it('falls through multiple failures to reach a healthy provider', () => {
    const chain: MockProviderConfig[] = [
      { name: 'provider-a', failureKind: 'timeout', latencyMs: 5000 },
      { name: 'provider-b', failureKind: 'server_error', latencyMs: 50 },
      { name: 'provider-c', failureKind: 'network_error', latencyMs: 0 },
      { name: 'provider-d', failureKind: null, latencyMs: 200 },
    ];

    const result = dispatchWithFallback(chain);

    expect(result.success).toBe(true);
    expect(result.provider).toBe('provider-d');
    expect(result.attempts).toHaveLength(4);
  });
});
