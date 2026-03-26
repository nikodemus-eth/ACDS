import type { RoutingDecisionReadRepository } from '@acds/grits';
import type { RoutingDecision } from '@acds/core-types';

export class InMemoryRoutingDecisionReadRepository implements RoutingDecisionReadRepository {
  private readonly decisions: RoutingDecision[] = [];
  private readonly executionMap = new Map<string, string>(); // executionId -> decisionId

  addDecision(decision: RoutingDecision, executionId?: string): void {
    this.decisions.push(decision);
    if (executionId) {
      this.executionMap.set(executionId, decision.id);
    }
  }

  async findById(id: string): Promise<RoutingDecision | undefined> {
    return this.decisions.find((d) => d.id === id);
  }

  async findByExecutionId(executionId: string): Promise<RoutingDecision | undefined> {
    const decisionId = this.executionMap.get(executionId);
    if (!decisionId) return undefined;
    return this.decisions.find((d) => d.id === decisionId);
  }
}
