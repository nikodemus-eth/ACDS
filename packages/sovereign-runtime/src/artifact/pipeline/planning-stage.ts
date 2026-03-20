import type { PipelineContext, PipelineStage } from './pipeline-types.js';
import type { CapabilityRegistry } from '../../registry/capability-registry.js';
import { scoreProviders } from '../../runtime/provider-scorer.js';
import { applyDisposition } from '../disposition-matrix.js';

// ---------------------------------------------------------------------------
// Stage 3: Planning
// ---------------------------------------------------------------------------

export class PlanningStage implements PipelineStage {
  readonly name = 'planning';

  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();

    if (!ctx.registryEntry || !ctx.capabilityId || !ctx.policyDecision?.allowed) {
      ctx.error = ctx.error ?? {
        stage: this.name,
        message: 'Cannot plan: prior stage failed or policy blocked',
        code: 'ARTIFACT_BLOCKED',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    const entry = ctx.registryEntry;

    // 1. Get all bindings for the capability
    const bindings = this.capabilityRegistry.getBindings(ctx.capabilityId);
    if (bindings.length === 0) {
      ctx.error = {
        stage: this.name,
        message: `No provider bindings for capability: ${ctx.capabilityId}`,
        code: 'PROVIDER_UNAVAILABLE',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    // 2. Score providers
    const scoring = scoreProviders(bindings, {
      maxLatencyMs: ctx.options.constraints?.maxLatencyMs,
      maxCostUSD: ctx.options.constraints?.maxCostUSD,
      localOnly: ctx.options.constraints?.localOnly,
    });

    if (scoring.scores.length === 0) {
      ctx.error = {
        stage: this.name,
        message: 'No eligible providers after constraint filtering',
        code: 'POLICY_BLOCKED',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    // 3. Apply disposition rules
    const dispositionFiltered = applyDisposition(entry.provider_disposition, scoring.scores);
    if (dispositionFiltered.length === 0) {
      ctx.error = {
        stage: this.name,
        message: `No providers eligible under ${entry.provider_disposition} disposition`,
        code: 'ARTIFACT_BLOCKED',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    // 4. Select winner
    const winner = dispositionFiltered[0];
    ctx.selectedProvider = winner.providerId;
    ctx.selectedMethod = winner.methodId;
    ctx.disposition = entry.provider_disposition;

    // Resolve provider family from provider ID
    ctx.selectedProviderFamily = winner.providerId.includes('apple') ? 'apple' : 'ollama';

    // 5. Prepare fallback
    if (dispositionFiltered.length > 1) {
      ctx.fallbackProvider = dispositionFiltered[1].providerId;
    }

    ctx.timings[this.name] = performance.now() - start;
    return ctx;
  }
}
