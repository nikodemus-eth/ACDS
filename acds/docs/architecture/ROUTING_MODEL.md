# Routing Model

ACDS routing is built on a central principle: **applications declare cognitive intent, not vendor choice**. A routing request describes what kind of thinking is needed, and the routing engine determines which model, tactic, and provider should handle it.

## Routing Request

A `RoutingRequest` expresses cognitive intent through these dimensions:

| Field              | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `application`      | Which application is making the request (e.g., `thingstead`)   |
| `process`          | Which process within the application (e.g., `content_review`)  |
| `step`             | Which step within the process (e.g., `initial_draft`)          |
| `taskType`         | The cognitive task type (e.g., generation, classification)     |
| `loadTier`         | Current load level (affects latency/cost tradeoffs)            |
| `decisionPosture`  | Advisory vs authoritative vs autonomous                        |
| `cognitiveGrade`   | Complexity grade (affects model capability requirements)       |
| `constraints`      | Privacy, latency, cost, structured output, traceability needs  |
| `instanceContext`   | Optional: retry count, previous failures, deadline pressure    |

None of these fields name a vendor or a model. The caller describes what they need; the system figures out how to deliver it.

## Eligibility Computation

Once the routing request is validated and normalized, the routing engine computes which model profiles and tactic profiles are eligible:

1. **Policy resolution.** The `PolicyMergeResolver` cascades Global -> Application -> Process policies to produce an `EffectivePolicy`. This determines allowed/blocked vendors, privacy constraints, cost sensitivity, and other bounds.

2. **Profile eligibility.** The `EligibleProfilesService` filters the set of all model profiles against the effective policy. A profile is eligible if:
   - Its vendor is not blocked
   - It satisfies the privacy constraint (local providers only if `local_only`)
   - It meets the cognitive grade requirement
   - It supports the requested task type
   - It is not explicitly blocked by an application or process policy

3. **Tactic eligibility.** The `EligibleTacticsService` filters tactic profiles against the effective policy and the selected model profile's capabilities.

## Deterministic Selection

Given the set of eligible profiles and tactics, selection is deterministic -- the same inputs always produce the same output:

- **`DeterministicProfileSelector`** ranks eligible model profiles by fit (cognitive grade match, cost, latency characteristics) and selects the top candidate.
- **`DeterministicTacticSelector`** ranks eligible tactic profiles for the selected model profile and selects the best match for the task type and posture.

If a process policy specifies a `defaultModelProfileId` or `defaultTacticProfileId`, those take precedence as long as they are in the eligible set.

## Fallback Chains

The `FallbackChainBuilder` constructs an ordered list of alternative (profile, tactic, provider) triples. Each entry in the fallback chain is a `FallbackEntry` with a priority number. The chain is built from the remaining eligible candidates after the primary selection, ordered by priority.

Fallback chains ensure that if the primary provider is unavailable or fails, execution can continue without re-routing. The chain is part of the `RoutingDecision` and is consumed by the execution orchestrator.

## Rationale Generation

Every routing decision includes a rationale:

- **`ExecutionRationaleBuilder`** captures why each decision was made: which policies applied, which profiles were eligible, why the selected profile won, and what the fallback options are.
- **`RationaleFormatter`** produces a human-readable summary stored in `RoutingDecision.rationaleSummary`.

The rationale is linked to the routing decision via `rationaleId` and is persisted for audit purposes. This makes every routing decision explainable after the fact.

## Routing Decision Output

The final `RoutingDecision` contains:

```typescript
{
  id: string;
  selectedModelProfileId: string;
  selectedTacticProfileId: string;
  selectedProviderId: string;
  fallbackChain: FallbackEntry[];
  rationaleId: string;
  rationaleSummary: string;
  resolvedAt: Date;
}
```

This decision is fully self-contained: the execution orchestrator can execute it without any further policy or routing computation.
