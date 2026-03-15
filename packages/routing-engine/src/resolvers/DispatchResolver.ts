import type { RoutingRequest, RoutingDecision, ModelProfile, TacticProfile } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import { RoutingRequestValidator } from '../intake/RoutingRequestValidator.js';
import { RoutingRequestNormalizer } from '../intake/RoutingRequestNormalizer.js';
import { EligibleProfilesService } from '../eligibility/EligibleProfilesService.js';
import { EligibleTacticsService } from '../eligibility/EligibleTacticsService.js';
import { DeterministicProfileSelector } from '../selection/DeterministicProfileSelector.js';
import { DeterministicTacticSelector } from '../selection/DeterministicTacticSelector.js';
import { FallbackChainBuilder } from '../selection/FallbackChainBuilder.js';
import { RoutingDecisionResolver } from '../selection/RoutingDecisionResolver.js';
import { ExecutionRationaleBuilder } from '../rationale/ExecutionRationaleBuilder.js';
import type { ExecutionRationale } from '@acds/core-types';

export interface DispatchResolverDeps {
  allProfiles: ModelProfile[];
  allTactics: TacticProfile[];
  profileProviderMap: Map<string, string>;
  effectivePolicy: EffectivePolicy;
}

export interface DispatchResult {
  decision: RoutingDecision;
  rationale: ExecutionRationale;
}

export class DispatchResolver {
  private readonly validator = new RoutingRequestValidator();
  private readonly normalizer = new RoutingRequestNormalizer();
  private readonly eligibleProfiles = new EligibleProfilesService();
  private readonly eligibleTactics = new EligibleTacticsService();
  private readonly profileSelector = new DeterministicProfileSelector();
  private readonly tacticSelector = new DeterministicTacticSelector();
  private readonly fallbackBuilder = new FallbackChainBuilder();
  private readonly decisionResolver = new RoutingDecisionResolver();
  private readonly rationaleBuilder = new ExecutionRationaleBuilder();

  resolve(request: RoutingRequest, deps: DispatchResolverDeps): DispatchResult {
    const validation = this.validator.validateTyped(request);
    if (!validation.valid) {
      throw new Error(`Invalid routing request: ${validation.errors.join(', ')}`);
    }

    const normalized = this.normalizer.normalize(request);
    const { allProfiles, allTactics, profileProviderMap, effectivePolicy } = deps;

    const eligibleProfileList = this.eligibleProfiles.computeEligible(allProfiles, effectivePolicy, normalized);
    const eligibleTacticList = this.eligibleTactics.computeEligible(allTactics, effectivePolicy, normalized);

    const selectedProfile = this.profileSelector.select(eligibleProfileList, effectivePolicy);
    if (!selectedProfile) throw new Error('No eligible model profile found');

    const selectedTactic = this.tacticSelector.select(eligibleTacticList, effectivePolicy);
    if (!selectedTactic) throw new Error('No eligible tactic profile found');

    const selectedProviderId = profileProviderMap.get(selectedProfile.id);
    if (!selectedProviderId) throw new Error(`No provider mapped for profile ${selectedProfile.id}`);

    const fallbackChain = this.fallbackBuilder.build(
      eligibleProfileList, selectedProfile.id, selectedTactic.id, profileProviderMap
    );

    const rationale = this.rationaleBuilder.build(
      '', normalized, selectedProfile, selectedTactic, selectedProviderId,
      effectivePolicy, eligibleProfileList.length, eligibleTacticList.length
    );

    const decision = this.decisionResolver.resolve(
      selectedProfile, selectedTactic, selectedProviderId,
      fallbackChain, rationale.id, `${rationale.selectedProfileReason} | ${rationale.selectedTacticReason}`
    );

    // Update rationale with decision ID
    const finalRationale = { ...rationale, routingDecisionId: decision.id };

    return { decision, rationale: finalRationale };
  }
}
