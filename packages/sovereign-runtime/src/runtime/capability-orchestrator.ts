import type { CapabilityContract } from '../domain/capability-contract.js';
import type { CapabilityRegistry } from '../registry/capability-registry.js';
import type { SourceRegistry } from '../registry/registry.js';
import type { ProviderRuntime, MethodExecutionResult } from '../providers/provider-runtime.js';
import type { ProviderScore, ScoringResult } from '../domain/score-types.js';
import { MethodUnresolvedError, ProviderUnavailableError, PolicyBlockedError } from '../domain/errors.js';
import { scoreProviders } from './provider-scorer.js';
import { enforceCostCeiling } from './cost-enforcer.js';

export interface CapabilityRequest {
  capability: string;
  version?: string;
  input: unknown;
  constraints?: {
    localOnly?: boolean;
    maxLatencyMs?: number;
    maxCostUSD?: number;
    sensitivity?: 'low' | 'medium' | 'high';
    preferredProvider?: string;
  };
  context?: Record<string, unknown>;
}

export interface CapabilityResponse {
  output: unknown;
  metadata: {
    capabilityId: string;
    capabilityVersion: string;
    providerId: string;
    methodId: string;
    executionMode: 'local' | 'controlled_remote' | 'session';
    deterministic: boolean;
    latencyMs: number;
    costUSD: number;
    tokenCount?: { input: number; output: number };
    validated: boolean;
    warnings?: string[];
  };
  decision: {
    eligibleProviders: number;
    selectedReason: string;
    fallbackAvailable: boolean;
    policyApplied: string[];
  };
}

export interface CapabilityOrchestratorDeps {
  capabilityRegistry: CapabilityRegistry;
  sourceRegistry: SourceRegistry;
  runtimes: Map<string, ProviderRuntime>;
  onValidate?: (response: CapabilityResponse) => { validated: boolean; warnings: string[] };
}

export class CapabilityOrchestrator {
  private readonly caps: CapabilityRegistry;
  private readonly runtimes: Map<string, ProviderRuntime>;
  private readonly onValidate?: (response: CapabilityResponse) => { validated: boolean; warnings: string[] };

  constructor(deps: CapabilityOrchestratorDeps) {
    this.caps = deps.capabilityRegistry;
    this.runtimes = deps.runtimes;
    this.onValidate = deps.onValidate;
  }

  async request(req: CapabilityRequest): Promise<CapabilityResponse> {
    // 1. Resolve capability contract
    const contract = this.caps.getContract(req.capability);
    if (!contract) {
      throw new MethodUnresolvedError(`Capability not found: ${req.capability}`);
    }
    if (req.version !== undefined && req.version !== contract.version) {
      throw new MethodUnresolvedError(
        `Capability version mismatch for ${req.capability}: requested ${req.version}, available ${contract.version}`,
      );
    }

    // 2. Get all bindings for this capability
    const allBindings = this.caps.getBindings(req.capability);
    if (allBindings.length === 0) {
      throw new MethodUnresolvedError(`No providers bound to capability: ${req.capability}`);
    }

    // 3. Score eligible providers
    const scoring = scoreProviders(allBindings, {
      maxLatencyMs: req.constraints?.maxLatencyMs,
      maxCostUSD: req.constraints?.maxCostUSD,
      localOnly: req.constraints?.localOnly,
    });

    if (scoring.scores.length === 0) {
      throw new PolicyBlockedError(
        'No eligible providers after constraint filtering',
        { capability: req.capability, constraints: req.constraints },
      );
    }

    // 4. Apply cost enforcement on winner
    const winnerBinding = allBindings.find(
      b => b.providerId === scoring.winner!.providerId && b.methodId === scoring.winner!.methodId
    );
    if (!winnerBinding) {
      throw new PolicyBlockedError('Winner binding not found in registry', {
        capability: req.capability,
        providerId: scoring.winner!.providerId,
      });
    }

    if (req.constraints?.maxCostUSD !== undefined) {
      const costResult = enforceCostCeiling(
        winnerBinding.cost,
        { maxCostPerRequest: req.constraints.maxCostUSD },
      );
      if (!costResult.allowed) {
        throw new PolicyBlockedError(costResult.reason!, {
          capability: req.capability,
          estimatedCost: costResult.estimatedCost,
        });
      }
    }

    // 5. Apply sensitivity policy
    const policyApplied: string[] = [];
    if (req.constraints?.sensitivity === 'high' && winnerBinding.locality !== 'local') {
      throw new PolicyBlockedError(
        'High sensitivity requires local provider',
        { capability: req.capability, providerId: winnerBinding.providerId },
      );
    }
    if (req.constraints?.sensitivity === 'high') {
      policyApplied.push('sensitivity:high→local_only');
    }
    if (req.constraints?.localOnly) {
      policyApplied.push('constraint:local_only');
    }

    // 6. Execute via provider runtime
    const runtime = this.runtimes.get(scoring.winner!.providerId);
    if (!runtime) {
      throw new ProviderUnavailableError(scoring.winner!.providerId);
    }

    const available = await runtime.isAvailable();
    if (!available) {
      // Try fallback from scoring results
      for (let i = 1; i < scoring.scores.length; i++) {
        const fallback = scoring.scores[i];
        const fallbackRuntime = this.runtimes.get(fallback.providerId);
        if (fallbackRuntime && await fallbackRuntime.isAvailable()) {
          try {
            const result = await fallbackRuntime.execute(fallback.methodId, req.input);
            return this.buildResponse(req, contract, fallback, scoring, result, policyApplied);
          } catch {
            continue;
          }
        }
      }
      throw new ProviderUnavailableError(scoring.winner!.providerId);
    }

    try {
      const result = await runtime.execute(scoring.winner!.methodId, req.input);
      return this.buildResponse(req, contract, scoring.winner!, scoring, result, policyApplied);
    } catch (error) {
      if (error instanceof Error && 'code' in error) throw error;
      throw new ProviderUnavailableError(scoring.winner!.providerId);
    }
  }

  private buildResponse(
    _req: CapabilityRequest,
    contract: CapabilityContract,
    selected: ProviderScore,
    scoring: ScoringResult,
    result: MethodExecutionResult,
    policyApplied: string[],
  ): CapabilityResponse {
    const response: CapabilityResponse = {
      output: result.output,
      metadata: {
        capabilityId: contract.id,
        capabilityVersion: contract.version,
        providerId: selected.providerId,
        methodId: selected.methodId,
        executionMode: result.executionMode,
        deterministic: result.deterministic,
        latencyMs: result.latencyMs,
        costUSD: 0, // Free for local providers
        validated: true,
      },
      decision: {
        eligibleProviders: scoring.scores.length,
        selectedReason: scoring.explanation,
        fallbackAvailable: scoring.scores.length > 1,
        policyApplied,
      },
    };

    if (this.onValidate) {
      const validation = this.onValidate(response);
      response.metadata.validated = validation.validated;
      if (validation.warnings.length > 0) {
        response.metadata.warnings = validation.warnings;
      }
    }

    return response;
  }
}
