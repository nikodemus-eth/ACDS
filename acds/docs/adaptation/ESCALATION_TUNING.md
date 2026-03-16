# Escalation Tuning

The `EscalationTuningService` adjusts the escalation preference for each execution family based on observed performance data. This tuning influences when and how aggressively the staged escalation pipeline promotes work from local to escalated execution paths.

## How Escalation Tuning Works

The `evaluateAndTune(familyKey, summary, constraints)` function takes:

- **PerformanceSummaryForTuning** -- rolling score, recent trend, local failure count, escalated success count, and total recent execution count.
- **PolicyConstraints** -- the family's posture, whether escalation is forced, and the minimum confidence threshold.

It returns an `EscalationTuningState` with:
- **preference** -- one of `early_escalate`, `normal_escalate`, `delayed_escalate`, or `local_preferred_until_fail`.
- **confidence** -- a 0-1 score indicating how confident the tuning is in its recommendation.
- **lastEvaluatedAt** -- ISO-8601 timestamp.

## Escalation Preferences

| Preference | Meaning |
|---|---|
| `early_escalate` | Prefer escalating sooner. Used when local execution is frequently failing or performance is declining. |
| `normal_escalate` | Standard escalation timing. The default when insufficient evidence exists to adjust. |
| `delayed_escalate` | Prefer exhausting local options before escalating. Used when escalated execution does not measurably outperform local. |
| `local_preferred_until_fail` | Only escalate after local execution fails. Used when local performance is strong and stable. |

## Tuning Logic

The tuning service applies the following rules in order:

1. **Forced escalation (hard stop):** If `constraints.forcedEscalation` is `true` (e.g., for `final` or `evidentiary` postures), the preference is always `early_escalate` with confidence 1.0. No further evaluation occurs.

2. **High local failure rate (>= 30%):** Suggests early escalation. Confidence scales with the failure rate.

3. **Strong local performance:** Rolling score >= 0.75, trend is not declining, and zero local failures. Suggests `local_preferred_until_fail`. Confidence scales with the rolling score.

4. **Declining trend with low rolling score (< 0.4):** Suggests early escalation with moderate confidence (0.7).

5. **Low escalated success rate (< 20%) with non-declining trend:** Suggests delayed escalation since escalation is not providing significant benefit.

6. **Confidence floor:** If the computed confidence is below `constraints.minConfidenceThreshold`, the preference falls back to `normal_escalate`.

## Hard Policy Constraints

The escalation tuning service respects two hard constraints that it will never override:

### Forced Escalation for Final/Evidentiary Postures

When `constraints.forcedEscalation` is `true`, the tuning service always returns `early_escalate` regardless of performance data. This ensures that families producing legally binding or compliance-critical outputs always route through the escalation path.

### Minimum Confidence Threshold

When the tuning service's confidence in its recommendation falls below `constraints.minConfidenceThreshold`, it reverts to `normal_escalate`. This prevents low-confidence tuning from pushing families into aggressive escalation postures without sufficient evidence.

## How Tuned Escalation Differs from Eligibility

Escalation tuning and eligibility enforcement operate at different layers:

| Aspect | Eligibility Layer | Escalation Tuning |
|---|---|---|
| **Purpose** | Determines which candidates CAN be used. | Determines WHEN to prefer escalated candidates. |
| **Enforcement** | Hard gates -- ineligible candidates are excluded. | Soft preferences -- influences ordering and timing. |
| **Scope** | Capability matching, rate limits, cost ceilings, posture. | Timing of escalation within the staged pipeline. |
| **Override** | Cannot be overridden by the optimizer. | Can be adjusted by the optimizer based on evidence. |
| **Policy binding** | Always enforced. | Advisory except for forced escalation postures. |

The key distinction: eligibility determines the candidate pool, while escalation tuning influences the order in which candidates from that pool are tried within a multi-stage execution.

## Adaptive Influence on Staged Escalation

In practice, the tuned escalation preference affects the staged execution pipeline as follows:

- **early_escalate:** The pipeline skips or shortens the local execution stage and moves to escalated candidates sooner.
- **normal_escalate:** Standard stage durations and retry counts.
- **delayed_escalate:** The pipeline extends the local execution stage, giving local candidates more attempts before escalating.
- **local_preferred_until_fail:** The pipeline only escalates when the local candidate returns an explicit failure.

These preferences are combined with the candidate ranking from the optimizer. A family with `local_preferred_until_fail` and a high-scoring local candidate will rarely escalate. A family with `early_escalate` and a declining local candidate will escalate quickly.

## Operator Considerations

- Escalation tuning runs as part of the periodic adaptation cycle (typically via the `adaptationRecommendationJob` worker).
- The tuning state is visible in the admin web UI on the family performance detail page.
- Operators can override tuning by changing the family's posture or mode. For example, setting a family to `observe_only` mode prevents the tuning from influencing routing.
- Monitor the `confidence` field. Low confidence values (< 0.5) indicate insufficient execution history to make a reliable tuning decision.
