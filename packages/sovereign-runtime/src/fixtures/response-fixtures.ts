import type { ACDSMethodResponse } from '../domain/execution-response.js';

export function makeSuccessResponse(overrides: Partial<ACDSMethodResponse['metadata']> = {}): ACDSMethodResponse {
  return {
    output: { result: 'test output' },
    metadata: {
      providerId: 'apple-intelligence-runtime',
      methodId: 'apple.foundation_models.summarize',
      executionMode: 'local',
      deterministic: true,
      latencyMs: 15,
      validated: true,
      ...overrides,
    },
  };
}
