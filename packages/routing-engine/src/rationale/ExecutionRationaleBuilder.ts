import type { ExecutionRationale, ModelProfile, TacticProfile, RoutingRequest } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { randomUUID } from 'node:crypto';

export class ExecutionRationaleBuilder {
  build(
    routingDecisionId: string,
    request: RoutingRequest,
    selectedProfile: ModelProfile,
    selectedTactic: TacticProfile,
    selectedProviderId: string,
    policy: EffectivePolicy,
    eligibleProfileCount: number,
    eligibleTacticCount: number
  ): ExecutionRationale {
    const familyKey = `${request.application}.${request.process}.${request.step}.${request.decisionPosture}.${request.cognitiveGrade}`;

    return {
      id: randomUUID(),
      routingDecisionId,
      executionFamilyKey: familyKey,
      selectedProfileReason: `Profile ${selectedProfile.name} selected: supports ${request.taskType}/${request.loadTier}, meets grade ${request.cognitiveGrade}`,
      selectedTacticReason: `Tactic ${selectedTactic.name} selected: method ${selectedTactic.executionMethod}`,
      selectedProviderReason: `Provider ${selectedProviderId} assigned to profile ${selectedProfile.name}`,
      policyMatchSummary: `Privacy: ${policy.privacy}, Cost: ${policy.costSensitivity}, Escalation: ${policy.forceEscalation}`,
      eligibleProfileCount,
      eligibleTacticCount,
      constraintsSummary: `Structured: ${policy.structuredOutputRequired}, Traceable: ${policy.traceabilityRequired}`,
      createdAt: new Date(),
    };
  }
}
