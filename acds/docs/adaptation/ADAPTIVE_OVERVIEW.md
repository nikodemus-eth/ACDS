# Adaptive Optimization Overview

## Why Adaptive Optimization Exists

ACDS dispatches cognitive work to provider candidates through execution families. Over time, the performance characteristics of providers change: latency shifts, cost structures evolve, and output quality varies across different task types. Static routing configurations cannot account for these dynamics.

Adaptive optimization closes this gap by continuously evaluating execution outcomes, detecting performance plateaus, ranking candidates based on observed evidence, and recommending or applying routing changes. The goal is to keep each execution family routed to the best-performing candidate without requiring constant manual tuning.

## Relationship Between Evaluation, Optimization, and Routing

The adaptive system operates as a feedback loop across three layers:

### Evaluation Layer (`@acds/evaluation`)

Scores each execution against nine metrics:

- **Acceptance** -- whether the output was accepted by the downstream consumer.
- **Schema Compliance** -- structural correctness of the output.
- **Correction Burden** -- how much manual correction was required.
- **Latency** -- time-to-completion relative to thresholds.
- **Cost** -- token and API cost relative to budget.
- **Unsupported Claims** -- factual grounding failures.
- **Confidence Alignment** -- how well model confidence scores correlate with actual outcomes.
- **Artifact Quality** -- completeness and coherence of generated artifacts.
- **Retry Frequency** -- penalizes high retry rates that indicate instability.

The `ExecutionScoreCalculator` produces a weighted composite score per execution. The `ExecutionHistoryAggregator` and `FamilyPerformanceSummary` roll individual scores into family-level rolling averages and trend signals.

### Optimization Layer (`@acds/adaptive-optimizer`)

Consumes family-level performance summaries to:

1. **Rank candidates** via `CandidateRanker` using a weighted composite of rolling score, recency, and run count.
2. **Detect plateaus** via `PlateauDetector` when rolling scores stagnate or decline.
3. **Select candidates** via `AdaptiveSelectionService` using exploitation (pick the best) or exploration (try an alternative) policies.
4. **Generate recommendations** via `AdaptationRecommendationService` when ranking changes are warranted but the current mode requires human approval.
5. **Record adaptation events** via `AdaptationEventBuilder` and `AdaptationLedgerWriter` for full auditability.
6. **Generate meta guidance** via `MetaGuidanceService` when plateau signals are moderate or severe, suggesting strategy changes (task splitting, critique insertion, model escalation, reasoning scaffold changes, multi-stage pipelines).
7. **Allocate cognitive budget globally** via `GlobalBudgetAllocator`, which shifts budget across execution families based on observed value scores (acceptance × volume / cost).

### Routing Layer (`@acds/routing-engine`)

The `AdaptiveDispatchResolver` and `AdaptiveCandidatePortfolioBuilder` translate the optimizer's selection into concrete routing decisions. Routing always respects policy constraints and eligibility rules; the optimizer can only influence which eligible candidate is preferred, never bypass policy.

## Policy-Bounded Adaptation

All adaptive behavior is bounded by policy:

- **Eligibility gates** remain enforced. The optimizer cannot select a candidate that fails eligibility checks (capability match, rate limits, cost ceiling, posture requirements).
- **Forced escalation** for final and evidentiary postures is never overridden by adaptive tuning. The `EscalationTuningService` respects `forcedEscalation` policy constraints.
- **Risk classification** gates auto-apply behavior. High-consequence families always require human approval, even in `fully_applied` mode. The `AdaptiveModePolicy.isAutoApplyPermitted()` function enforces this.
- **Adaptive mode** controls how far the optimizer can go without human intervention. See [ADAPTIVE_MODES.md](./ADAPTIVE_MODES.md) for details.
- **Audit trail** is maintained for every adaptation event, approval decision, auto-apply action, and rollback. No ranking change occurs without a corresponding ledger entry.

## Data Flow Summary

```
Execution Outcome
    |
    v
Evaluation (score per execution)
    |
    v
Aggregation (family rolling score + trend)
    |
    v
Plateau Detection (stagnation signals)
    |
    v
Candidate Ranking (ordered by composite score)
    |
    v
Adaptive Selection (exploit or explore)
    |
    v
Recommendation / Auto-Apply / Observe
    |
    v
Approval Workflow (if required by mode)
    |
    v
Routing Update (via AdaptiveDispatchResolver)
```

## Key Invariants

1. The optimizer never creates, modifies, or deletes providers. It only reorders the preference ranking within an execution family.
2. No provider execution occurs during optimization. Ranking changes are state mutations, not API calls.
3. Every ranking change is reversible via the rollback tooling. See [ROLLBACK_OPERATIONS.md](./ROLLBACK_OPERATIONS.md).
4. The adaptive system is entirely opt-in per family via the adaptive mode setting.
