import type { RoutingDecision } from '@acds/core-types';

/**
 * Read-only repository for routing decisions.
 * GRITS uses this to verify that executions match their routing decisions.
 */
export interface RoutingDecisionReadRepository {
  /** Retrieve a routing decision by its unique ID. */
  findById(id: string): Promise<RoutingDecision | undefined>;

  /** Retrieve the routing decision associated with an execution. */
  findByExecutionId(executionId: string): Promise<RoutingDecision | undefined>;
}
