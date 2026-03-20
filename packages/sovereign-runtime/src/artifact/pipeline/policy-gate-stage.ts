import type { PipelineContext, PipelineStage } from './pipeline-types.js';
import { isProviderEligible } from '../disposition-matrix.js';

// ---------------------------------------------------------------------------
// Stage 2: Policy Gate
// ---------------------------------------------------------------------------

export class PolicyGateStage implements PipelineStage {
  readonly name = 'policy_gate';

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const start = performance.now();

    if (!ctx.registryEntry) {
      ctx.error = { stage: this.name, message: 'No registry entry (intake failed)', code: 'ARTIFACT_BLOCKED' };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }

    const entry = ctx.registryEntry;
    const trace: string[] = [];
    const localOnly = ctx.options.constraints?.localOnly ?? false;

    // 1. Verify artifact class is allowed (all are allowed in MVP)
    trace.push(`artifact class ${entry.family} allowed`);

    // 2. Verify provider eligibility under disposition
    const defaultEligible = isProviderEligible(entry.provider_disposition, entry.default_provider);
    if (!defaultEligible) {
      ctx.policyDecision = {
        allowed: false,
        blocked_reason: `Default provider ${entry.default_provider} not eligible under ${entry.provider_disposition} disposition`,
        tier: 'blocked',
        trace: [...trace, `default provider ${entry.default_provider} ineligible under ${entry.provider_disposition}`],
        local_only: localOnly,
      };
      ctx.error = {
        stage: this.name,
        message: ctx.policyDecision.blocked_reason,
        code: 'ARTIFACT_BLOCKED',
      };
      ctx.timings[this.name] = performance.now() - start;
      return ctx;
    }
    trace.push(`provider disposition ${entry.provider_disposition} satisfied`);

    // 3. Check local-only requirement
    if (localOnly) {
      trace.push('local-only constraint active');
    }

    // 4. Content restrictions (placeholder — all pass in MVP)
    trace.push('content policy: passed');

    // 5. Retention policy
    trace.push('retention policy: ephemeral_preview_plus_artifact_log');

    ctx.policyDecision = {
      allowed: true,
      tier: 'allowed',
      trace,
      local_only: localOnly,
    };

    ctx.timings[this.name] = performance.now() - start;
    return ctx;
  }
}
