# Adaptive Modes

The `AdaptiveMode` type (defined in `@acds/adaptive-optimizer`) controls how aggressively the optimizer applies its ranking decisions. Each execution family is assigned one mode. The mode can be changed at any time by an operator.

## Mode Reference

### `observe_only`

**Behavior:** The optimizer computes candidate rankings and logs all evaluation data, but does not change the current candidate selection or generate recommendations.

**When to use:**
- During initial deployment when you want to validate that scoring and ranking logic produce sensible results before acting on them.
- For high-consequence families where you want visibility into what the optimizer would do without any risk of change.
- When debugging evaluation pipelines -- observe mode lets you inspect computed rankings without side effects.

**What happens:**
- `AdaptiveSelectionService.select()` returns the current candidate unchanged.
- Plateau detection runs and signals are logged, but no recommendations are created.
- Adaptation events are recorded with the observe-only marker for audit purposes.

### `recommend_only`

**Behavior:** The optimizer computes rankings, detects plateaus, and generates `AdaptationRecommendation` records when it identifies a beneficial change. Recommendations enter the approval queue for human review. No ranking changes are applied automatically.

**When to use:**
- For families where you trust the evaluation pipeline but want a human to approve every change.
- As a stepping stone from `observe_only` before enabling auto-apply.
- For medium-consequence families where the cost of a bad routing change is significant but not catastrophic.

**What happens:**
- `AdaptiveSelectionService.select()` returns the top-ranked candidate as a recommendation, not an applied selection.
- `AdaptationRecommendationService.generateRecommendation()` creates a pending recommendation.
- The recommendation appears in the admin approval queue (see [APPROVAL_WORKFLOW.md](./APPROVAL_WORKFLOW.md)).
- No ranking state is mutated until a human approves the recommendation.

### `auto_apply_low_risk`

**Behavior:** The optimizer automatically applies ranking changes for families classified as low-risk, provided all qualification criteria are met. Families that do not qualify receive recommendations instead (same as `recommend_only`).

**When to use:**
- For routine, low-consequence families (e.g., exploratory drafting, advisory summaries) where the cost of a suboptimal routing choice is minimal.
- When you want to reduce operator workload for families that have demonstrated stable performance.

**What happens:**
- `LowRiskAutoApplyService.inspectAndApply()` evaluates qualification criteria:
  - Family risk level is `low` (per `AdaptiveModePolicy.isAutoApplyPermitted()`).
  - Family posture is exploratory, advisory, or operational (not final or evidentiary).
  - No recent execution failures.
  - Rolling score is above the configured threshold (default: 0.5).
- If all criteria are met, the ranking change is applied and an `AutoApplyDecisionRecord` is persisted.
- If any criterion fails, a recommendation is generated for human review instead.
- See [AUTO_APPLY_LOW_RISK.md](./AUTO_APPLY_LOW_RISK.md) for full qualification details.

### `fully_applied`

**Behavior:** The optimizer applies its selection for all families except those classified as high-risk. High-risk families still receive recommendations requiring human approval.

**When to use:**
- For mature families with a long track record of stable adaptive behavior.
- When operator confidence in the evaluation and ranking pipeline is high.
- Only after the family has operated successfully in `auto_apply_low_risk` mode for a sustained period.

**What happens:**
- `AdaptiveSelectionService.select()` applies the exploitation or exploration selection directly.
- `AdaptiveModePolicy.isAutoApplyPermitted()` permits auto-apply for low and medium risk families.
- High-risk families (risk level `high`) are excluded from auto-apply even in this mode. They receive recommendations instead.
- Exploration policy still operates, so occasional alternative candidates will be selected to prevent local optima.

## Mode Progression

The recommended progression for a new family:

```
observe_only  -->  recommend_only  -->  auto_apply_low_risk  -->  fully_applied
```

Each transition should be made only after the operator has verified:

1. Scoring and ranking produce expected results (observe_only period).
2. Recommendations align with operator judgment (recommend_only period).
3. Auto-applied changes improve or maintain performance (auto_apply_low_risk period).
4. The family's risk classification and posture are appropriate for the target mode.

## Changing Modes

Mode changes take effect on the next adaptive selection cycle. There is no restart or re-initialization required. The optimizer state (rolling scores, candidate rankings, exploration rate) is preserved across mode transitions.

Operators can change modes via the admin API or the admin web interface. Mode changes are recorded in the adaptation event ledger for audit purposes.
