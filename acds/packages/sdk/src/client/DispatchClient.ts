import type { RoutingRequest, RoutingDecision, DispatchRunRequest, DispatchRunResponse } from '@acds/core-types';
import { ApiTransport } from './ApiTransport.js';
import { DispatchClientConfig } from './DispatchClientConfig.js';

/**
 * High-level client for the ACDS Dispatch API.
 *
 * Usage:
 * ```ts
 * const client = new DispatchClient({ baseUrl: 'https://acds.example.com/api' });
 * const decision = await client.resolve(routingRequest);
 * const result   = await client.run(dispatchRunRequest);
 * ```
 */
export class DispatchClient {
  private readonly transport: ApiTransport;

  constructor(config: DispatchClientConfig) {
    this.transport = new ApiTransport(config);
  }

  /**
   * Resolve a routing request into a routing decision without executing.
   * The returned `RoutingDecision` describes which model, tactic, and
   * provider would be selected along with the fallback chain.
   */
  async resolve(request: RoutingRequest): Promise<RoutingDecision> {
    return this.transport.post<RoutingDecision>('/v1/routing/resolve', request);
  }

  /**
   * Submit a full dispatch run: routes the request, executes against the
   * chosen provider, and returns the execution result.
   */
  async run(request: DispatchRunRequest): Promise<DispatchRunResponse> {
    return this.transport.post<DispatchRunResponse>('/v1/dispatch/run', request);
  }
}
