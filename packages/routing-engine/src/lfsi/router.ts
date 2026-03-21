// LFSI MVP — Deterministic Router
// Spec reference: Section 13 (Router Requirements)
//
// Algorithm:
// 1. Reject unknown capability
// 2. Reject provider overrides from clients
// 3. Resolve policy
// 4. Determine allowed tiers
// 5. Select providers by tier order
// 6. Try Apple first where applicable
// 7. Validate result
// 8. Escalate to Ollama when validation fails and policy allows
// 9. Return deterministic failure when no provider succeeds
// 10. Write a ledger event on every request

import type { InferenceProvider, InferenceRequest, InferenceResult } from './types.js';
import { isKnownCapability } from './capabilities.js';
import { LfsiError, LFSI_REASON } from './errors.js';
import { resolvePolicy } from './policies.js';
import { validateResult } from './validator.js';
import { type InMemoryLedgerSink, buildLedgerEvent } from './ledger.js';

const TIER_ORDER = ['tier0', 'tier1', 'tier2'] as const;

export interface RouterConfig {
  providers: InferenceProvider[];
  ledger: InMemoryLedgerSink;
}

export class LfsiRouter {
  private readonly providers: InferenceProvider[];
  private readonly ledger: InMemoryLedgerSink;

  constructor(config: RouterConfig) {
    this.providers = config.providers;
    this.ledger = config.ledger;
  }

  async route(request: InferenceRequest): Promise<InferenceResult> {
    const startMs = Date.now();
    let attempts = 0;
    let selectedProvider = '';
    let selectedTier: typeof TIER_ORDER[number] = 'tier0';
    let escalated = false;
    let escalatedTo: string | undefined;

    try {
      // Step 1: Reject unknown capability
      if (!isKnownCapability(request.capability)) {
        throw new LfsiError(LFSI_REASON.UNKNOWN_CAPABILITY, `Unknown capability: ${request.capability}`);
      }

      // Step 2: Reject provider overrides
      if (request.hasProviderOverride) {
        throw new LfsiError(
          LFSI_REASON.CLIENT_PROVIDER_OVERRIDE_FORBIDDEN,
          'Client-side provider overrides are forbidden',
        );
      }

      // Step 3: Resolve policy (may throw for denied capabilities)
      const policy = resolvePolicy(request.policyProfile, request.capability);

      // Step 4: Select providers by tier order, filtered by policy + capability
      const eligible = this.providers
        .filter(p => policy.allowedTiers.includes(p.tier))
        .filter(p => p.capabilities.includes(request.capability))
        .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

      if (eligible.length === 0) {
        throw new LfsiError(LFSI_REASON.NO_PROVIDER_AVAILABLE, `No provider supports '${request.capability}' under policy '${request.policyProfile}'`);
      }

      // Step 5–8: Try providers in tier order with validation and escalation
      for (let i = 0; i < eligible.length; i++) {
        const provider = eligible[i];
        selectedProvider = provider.id;
        selectedTier = provider.tier;
        attempts++;

        // Check availability
        const available = await provider.isAvailable();
        if (!available) {
          if (request.policyProfile === 'lfsi.apple_only' && provider.tier === 'tier0') {
            throw new LfsiError(LFSI_REASON.APPLE_PROVIDER_UNAVAILABLE, 'Apple provider is unavailable under apple_only policy');
          }
          continue;
        }

        // Execute
        const result = await provider.invoke(request);

        // Validate
        const validation = validateResult(request.capability, result);

        if (validation.passed) {
          // Success — write ledger and return
          this.ledger.write(buildLedgerEvent({
            taskId: request.taskId,
            sourceSystem: request.sourceSystem,
            capability: request.capability,
            policyProfile: request.policyProfile,
            selectedTier,
            selectedProvider,
            validationPassed: true,
            escalated,
            escalatedTo,
            finalProvider: provider.id,
            latencyMs: Date.now() - startMs,
            resultStatus: 'success',
            attempts,
          }));
          return result;
        }

        // Validation failed
        if (!policy.allowEscalation) {
          const reason = request.policyProfile === 'lfsi.apple_only'
            ? LFSI_REASON.APPLE_ONLY_VALIDATION_FAILURE
            : LFSI_REASON.VALIDATION_FAILED_NO_ESCALATION;
          throw new LfsiError(reason, `Validation failed for '${request.capability}' on ${provider.id}, no escalation allowed`);
        }

        // Mark escalation and try next provider
        if (i < eligible.length - 1) {
          escalated = true;
          escalatedTo = eligible[i + 1].id;
        }
      }

      // All providers exhausted
      throw new LfsiError(LFSI_REASON.NO_PROVIDER_AVAILABLE, 'All eligible providers failed or were unavailable');

    } catch (err) {
      // Write ledger event for errors too — every request gets a ledger entry
      const reasonCode = err instanceof LfsiError ? err.reasonCode : undefined;
      this.ledger.write(buildLedgerEvent({
        taskId: request.taskId,
        sourceSystem: request.sourceSystem,
        capability: request.capability,
        policyProfile: request.policyProfile,
        selectedTier,
        selectedProvider: selectedProvider || 'none',
        validationPassed: false,
        escalated,
        escalatedTo,
        finalProvider: selectedProvider || 'none',
        latencyMs: Date.now() - startMs,
        resultStatus: reasonCode === LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT ||
                      reasonCode === LFSI_REASON.CURRENT_WEB_FORBIDDEN_UNDER_PRIVATE_STRICT
          ? 'denied' : 'failure',
        reasonCode,
        attempts,
      }));
      throw err;
    }
  }
}
