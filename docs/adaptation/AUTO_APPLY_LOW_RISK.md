# Auto-Apply Low Risk

When a family operates in `auto_apply_low_risk` mode, the `LowRiskAutoApplyService` evaluates whether a pending recommendation can be applied automatically without human approval. This document describes the qualification criteria, what is and is not auto-applied, and the guardrails in place.

## What Qualifies as Low-Risk

A recommendation qualifies for automatic application when ALL of the following criteria are met:

### 1. Mode Compatibility

The adaptive mode must be `auto_apply_low_risk` or `fully_applied`. The `AdaptiveModePolicy.isAutoApplyPermitted()` function enforces this check.

### 2. Family Risk Level is Low

The family must be classified as `low` risk by the `FamilyRiskProvider`. Families classified as `medium` or `high` risk are not eligible for auto-apply in `auto_apply_low_risk` mode. (In `fully_applied` mode, `medium` risk families are also eligible, but `high` risk families are never eligible.)

### 3. Family Posture is Non-Critical

The family posture must be one of:
- `exploratory`
- `advisory`
- `operational`

Families with `final` or `evidentiary` postures are never eligible for auto-apply regardless of risk level or mode. These postures indicate outputs that have legal, compliance, or binding significance.

### 4. No Recent Execution Failures

The `RecentFailureCounter` must report zero recent failures for the family (configurable via `maxRecentFailures`, default: 0). Any recent failures indicate instability that warrants human review.

### 5. Rolling Score Above Threshold

The family's rolling score must be at or above the configured threshold (default: 0.5). A low rolling score suggests the family is underperforming and changes should be reviewed by a human.

## What Is Auto-Applied

When all criteria are met, the `LowRiskAutoApplyService.inspectAndApply()` method:

1. Creates an `AutoApplyDecisionRecord` capturing the previous ranking, new ranking, reason, mode, risk basis, and timestamp.
2. Persists the record via the `AutoApplyDecisionWriter`.
3. Applies the new top-ranked candidate to optimizer state through an `AutoApplyStateApplier`.
4. Returns the record for downstream audit and UI surfaces.

The auto-apply operation only mutates the candidate ranking for the family. It does not:
- Execute any provider calls.
- Modify provider configurations.
- Change the family's adaptive mode.
- Bypass eligibility or policy constraints.

## What Is Not Auto-Applied

The following changes always require human approval, even in `auto_apply_low_risk` mode:

- **Ranking changes for medium or high risk families.** These receive recommendations instead.
- **Ranking changes for families with final or evidentiary postures.** These always require human review.
- **Changes when there are recent execution failures.** Instability warrants human judgment.
- **Changes when the rolling score is below the threshold.** Poor performance warrants human review.
- **Plateau signals of moderate or severe severity.** In `auto_apply_low_risk` mode, `AdaptationRecommendationService.generateRecommendation()` creates a recommendation for human review when the plateau severity is above `mild`.

## Guardrails

### Audit Trail

Every auto-apply decision produces an `AutoApplyDecisionRecord` with:
- `id` -- unique identifier.
- `familyKey` -- the affected family.
- `previousRanking` -- candidate ordering before the change.
- `newRanking` -- candidate ordering after the change.
- `reason` -- human-readable explanation including posture, risk level, rolling score, and failure count.
- `mode` -- the adaptive mode in effect.
- `riskBasis` -- the risk level that qualified this family.
- `appliedAt` -- ISO-8601 timestamp.

### Rollback

Any auto-applied change can be rolled back using the rollback tooling. See [ROLLBACK_OPERATIONS.md](./ROLLBACK_OPERATIONS.md).

### Configuration

The `LowRiskAutoApplyConfig` allows operators to tune:
- `rollingScoreThreshold` (default: 0.5) -- minimum rolling score for auto-apply eligibility.
- `maxRecentFailures` (default: 0) -- maximum recent failures permitted.

### Mode Escalation Path

If auto-applied changes cause performance degradation, the operator should:
1. Roll back the most recent auto-applied change.
2. Downgrade the family to `recommend_only` mode.
3. Investigate the root cause before re-enabling `auto_apply_low_risk`.

## Hardening Notes

- `LowRiskAutoApplyConfig` is now validated at construction time. Invalid thresholds fail fast.
- Auto-apply now mutates `FamilySelectionState` when a recommendation is accepted for automatic application.
- The remaining trust boundary is the external classification providers (`FamilyRiskProvider`, `FamilyPostureProvider`, `RecentFailureCounter`). Their outputs are still authoritative, so production deployments should back them with audited data sources rather than permissive defaults.
