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
3. Returns the record so the caller can update the optimizer state with the new ranking.

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

## Known Issues (ARGUS-9 Red Team Findings)

The following issues were identified during adversarial testing and should be addressed before production deployment:

1. **Auto-apply does NOT mutate `FamilySelectionState`.** `inspectAndApply()` creates an `AutoApplyDecisionRecord` and persists it, but does not update the family's `currentCandidateId` or ranking. The caller must apply the new ranking — but no caller currently does so. This is the same decision-to-application gap found in the approval and rollback services.

2. **Provider trust is blind.** The `FamilyRiskProvider`, `FamilyPostureProvider`, and `RecentFailureCounter` are trusted without independent verification. A misconfigured or compromised provider can return `'low'` risk for a high-consequence family, `'advisory'` posture for a `final` family, or `0` failures when failures exist. The service has no cross-validation against observable family state.

3. **`rollingScoreThreshold` accepts negative values.** Setting `rollingScoreThreshold: -1` in the config means any `rollingScore` (including 0.0) qualifies for auto-apply, effectively disabling the score threshold check. Config values should be validated at construction time.

4. **`isAutoApplyPermitted('fully_applied', 'medium')` returns `true`.** Medium-risk families are eligible for auto-apply in `fully_applied` mode. This is documented behavior but may be surprising — operators should understand that `fully_applied` mode permits medium-risk auto-apply without human review.

5. **No config validation at construction time.** The `LowRiskAutoApplyConfig` is spread over defaults without validation. Negative thresholds, zero maxRecentFailures with `>` comparison (allowing exactly 0 failures), and other edge cases are accepted silently.
