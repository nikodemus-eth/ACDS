/**
 * AdaptiveDispatchResolver - Like DispatchResolver but with adaptive insertion.
 *
 * Pipeline: validate -> normalize -> eligibility -> build portfolio ->
 * invoke AdaptiveSelectionService -> build RoutingDecision with adaptive rationale.
 *
 * Falls back to deterministic routing when adaptive mode is disabled
 * or no optimizer state exists.
 */

import type { RoutingRequest, RoutingDecision, ModelProfile, TacticProfile, ExecutionRationale } from '@acds/core-types';
import type { EffectivePolicy } from '@acds/policy-engine';
import type {
  AdaptiveMode,
  AdaptiveSelectionResult,
  OptimizerStateRepository,
} from '@acds/adaptive-optimizer';
import { select } from '@acds/adaptive-optimizer';
import { RoutingRequestValidator } from '../intake/RoutingRequestValidator.js';
import { RoutingRequestNormalizer } from '../intake/RoutingRequestNormalizer.js';
import { EligibleProfilesService } from '../eligibility/EligibleProfilesService.js';
import { EligibleTacticsService } from '../eligibility/EligibleTacticsService.js';
import { DeterministicProfileSelector } from '../selection/DeterministicProfileSelector.js';
import { DeterministicTacticSelector } from '../selection/DeterministicTacticSelector.js';
import { FallbackChainBuilder } from '../selection/FallbackChainBuilder.js';
import { RoutingDecisionResolver } from '../selection/RoutingDecisionResolver.js';
import { ExecutionRationaleBuilder } from '../rationale/ExecutionRationaleBuilder.js';
import { buildCandidatePortfolio } from '../selection/AdaptiveCandidatePortfolioBuilder.js';
import { parseCandidateId } from '@acds/adaptive-optimizer';

export interface AdaptiveDispatchResolverDeps {
  allProfiles: ModelProfile[];
  allTactics: TacticProfile[];
  profileProviderMap: Map<string, string>;
  effectivePolicy: EffectivePolicy;
  /** The execution family key for adaptive selection. */
  familyKey: string;
  /** Optimizer state repository. If undefined, falls back to deterministic. */
  optimizerStateRepository?: OptimizerStateRepository;
  /** Adaptive mode. Defaults to deterministic fallback when undefined. */
  adaptiveMode?: AdaptiveMode;
}

export interface AdaptiveDispatchResult {
  decision: RoutingDecision;
  rationale: ExecutionRationale;
  /** Adaptive selection result, only present when adaptive mode is active. */
  adaptiveResult?: AdaptiveSelectionResult;
}

export class AdaptiveDispatchResolver {
  private readonly validator = new RoutingRequestValidator();
  private readonly normalizer = new RoutingRequestNormalizer();
  private readonly eligibleProfiles = new EligibleProfilesService();
  private readonly eligibleTactics = new EligibleTacticsService();
  private readonly profileSelector = new DeterministicProfileSelector();
  private readonly tacticSelector = new DeterministicTacticSelector();
  private readonly fallbackBuilder = new FallbackChainBuilder();
  private readonly decisionResolver = new RoutingDecisionResolver();
  private readonly rationaleBuilder = new ExecutionRationaleBuilder();

  async resolve(
    request: RoutingRequest,
    deps: AdaptiveDispatchResolverDeps,
  ): Promise<AdaptiveDispatchResult> {
    // ── Step 1: Validate ──────────────────────────────────────────────
    const validation = this.validator.validateTyped(request);
    if (!validation.valid) {
      throw new Error(`Invalid routing request: ${validation.errors.join(', ')}`);
    }

    // ── Step 2: Normalize ─────────────────────────────────────────────
    const normalized = this.normalizer.normalize(request);
    const { allProfiles, allTactics, profileProviderMap, effectivePolicy, familyKey } = deps;

    // ── Step 3: Eligibility ───────────────────────────────────────────
    const eligibleProfileList = this.eligibleProfiles.computeEligible(allProfiles, effectivePolicy, normalized);
    const eligibleTacticList = this.eligibleTactics.computeEligible(allTactics, effectivePolicy, normalized);

    // ── Step 4: Attempt adaptive path ─────────────────────────────────
    const canUseAdaptive = deps.adaptiveMode && deps.optimizerStateRepository;

    if (canUseAdaptive) {
      const adaptiveResult = await this.tryAdaptiveSelection(
        familyKey,
        eligibleProfileList,
        eligibleTacticList,
        profileProviderMap,
        deps.optimizerStateRepository!,
        deps.adaptiveMode!,
      );

      if (adaptiveResult) {
        return this.buildAdaptiveDecision(
          normalized,
          adaptiveResult,
          eligibleProfileList,
          eligibleTacticList,
          profileProviderMap,
          effectivePolicy,
        );
      }

      console.log(
        `[adaptive-dispatch] family=${familyKey}: adaptive selection returned no result, falling back to deterministic`,
      );
    }

    // ── Step 5: Deterministic fallback ────────────────────────────────
    return this.buildDeterministicDecision(
      normalized,
      eligibleProfileList,
      eligibleTacticList,
      profileProviderMap,
      effectivePolicy,
    );
  }

  /**
   * Attempts adaptive selection. Returns undefined if no optimizer state
   * exists for this family (triggering deterministic fallback).
   */
  private async tryAdaptiveSelection(
    familyKey: string,
    eligibleProfiles: ModelProfile[],
    eligibleTactics: TacticProfile[],
    profileProviderMap: Map<string, string>,
    repo: OptimizerStateRepository,
    mode: AdaptiveMode,
  ): Promise<AdaptiveSelectionResult | undefined> {
    const familyState = await repo.getFamilyState(familyKey);
    if (!familyState) {
      // No optimizer state exists – fall back to deterministic
      return undefined;
    }

    const existingCandidateStates = await repo.getCandidateStates(familyKey);

    const portfolio = buildCandidatePortfolio({
      familyKey,
      eligibleProfiles,
      eligibleTactics,
      profileProviderMap,
      existingCandidateStates,
    });

    if (portfolio.length === 0) {
      return undefined;
    }

    return select(familyKey, portfolio, familyState, existingCandidateStates, mode);
  }

  /**
   * Builds a RoutingDecision from an adaptive selection result.
   */
  private buildAdaptiveDecision(
    normalized: RoutingRequest,
    adaptiveResult: AdaptiveSelectionResult,
    eligibleProfileList: ModelProfile[],
    eligibleTacticList: TacticProfile[],
    profileProviderMap: Map<string, string>,
    effectivePolicy: EffectivePolicy,
  ): AdaptiveDispatchResult {
    const candidateId = adaptiveResult.selectedCandidate.candidate.candidateId;
    const parsed = parseCandidateId(candidateId);

    const selectedProfile = eligibleProfileList.find((p) => p.id === parsed.modelProfileId);
    if (!selectedProfile) {
      throw new Error(`Adaptive selection chose unavailable profile: ${parsed.modelProfileId}`);
    }

    const selectedTactic = eligibleTacticList.find((t) => t.id === parsed.tacticProfileId);
    if (!selectedTactic) {
      throw new Error(`Adaptive selection chose unavailable tactic: ${parsed.tacticProfileId}`);
    }

    const fallbackChain = this.fallbackBuilder.build(
      eligibleProfileList,
      selectedProfile.id,
      selectedTactic.id,
      profileProviderMap,
    );

    const adaptiveRationale = `[adaptive] ${adaptiveResult.selectionReason}`;

    const rationale = this.rationaleBuilder.build(
      '',
      normalized,
      selectedProfile,
      selectedTactic,
      parsed.providerId,
      effectivePolicy,
      eligibleProfileList.length,
      eligibleTacticList.length,
    );

    const decision = this.decisionResolver.resolve(
      selectedProfile,
      selectedTactic,
      parsed.providerId,
      fallbackChain,
      rationale.id,
      adaptiveRationale,
    );

    const finalRationale = { ...rationale, routingDecisionId: decision.id };

    return { decision, rationale: finalRationale, adaptiveResult };
  }

  /**
   * Builds a RoutingDecision using the deterministic pipeline.
   */
  private buildDeterministicDecision(
    normalized: RoutingRequest,
    eligibleProfileList: ModelProfile[],
    eligibleTacticList: TacticProfile[],
    profileProviderMap: Map<string, string>,
    effectivePolicy: EffectivePolicy,
  ): AdaptiveDispatchResult {
    const selectedProfile = this.profileSelector.select(eligibleProfileList, effectivePolicy);
    if (!selectedProfile) throw new Error('No eligible model profile found');

    const selectedTactic = this.tacticSelector.select(eligibleTacticList, effectivePolicy);
    if (!selectedTactic) throw new Error('No eligible tactic profile found');

    const selectedProviderId = profileProviderMap.get(selectedProfile.id);
    if (!selectedProviderId) throw new Error(`No provider mapped for profile ${selectedProfile.id}`);

    const fallbackChain = this.fallbackBuilder.build(
      eligibleProfileList,
      selectedProfile.id,
      selectedTactic.id,
      profileProviderMap,
    );

    const rationale = this.rationaleBuilder.build(
      '',
      normalized,
      selectedProfile,
      selectedTactic,
      selectedProviderId,
      effectivePolicy,
      eligibleProfileList.length,
      eligibleTacticList.length,
    );

    const decision = this.decisionResolver.resolve(
      selectedProfile,
      selectedTactic,
      selectedProviderId,
      fallbackChain,
      rationale.id,
      `[deterministic] ${rationale.selectedProfileReason} | ${rationale.selectedTacticReason}`,
    );

    const finalRationale = { ...rationale, routingDecisionId: decision.id };

    return { decision, rationale: finalRationale };
  }
}
