# Operator Playbook

This playbook provides step-by-step procedures for operating the ACDS adaptive optimization system. It covers daily and weekly review routines, plateau signal inspection, recommendation management, and rollback procedures.

## Daily Review Checklist

### 1. Check the Adaptation Dashboard

Navigate to `/adaptation` in the admin web UI. Review the family performance table for:

- [ ] **Declining families:** Any family with a `declining` trend badge requires attention. Check the family detail page for the specific metric trends that are driving the decline.
- [ ] **High failure counts:** Families with non-zero recent failures may indicate provider instability or evaluation issues.
- [ ] **Low rolling scores:** Families with rolling scores below 0.5 may benefit from a mode change or manual ranking adjustment.

### 2. Review the Approval Queue

Navigate to `/adaptation/approvals`. Check for pending recommendations:

- [ ] **Pending approvals:** Review each pending recommendation. Check the evidence summary, current vs. proposed ranking, and family context.
- [ ] **Approve or reject:** Make a decision on each pending recommendation. Provide a reason when rejecting.
- [ ] **Expiring approvals:** Note any approvals nearing their 24-hour expiry. Decide before they expire to avoid losing the recommendation.

### 3. Check Plateau Alerts

The adaptation dashboard displays a plateau alerts panel at the top of the page. Review any active plateau signals:

- [ ] **Mild plateaus:** May resolve on their own. Monitor over the next 1-2 days.
- [ ] **Moderate plateaus:** Consider approving pending recommendations or manually adjusting rankings.
- [ ] **Severe plateaus:** Requires immediate attention. Consider switching the family to `recommend_only` mode and investigating root cause.

### 4. Verify Auto-Apply Activity

For families in `auto_apply_low_risk` mode:

- [ ] **Check recent auto-apply records:** Verify that auto-applied changes are producing expected results. If performance is declining after an auto-apply, initiate a rollback.
- [ ] **Confirm qualification criteria:** Verify that families in auto-apply mode still meet the low-risk criteria. If a family's posture or risk level has changed, the auto-apply behavior may no longer be appropriate.

## Weekly Review Checklist

### 1. Review Family Mode Assignments

- [ ] **Observe-only families:** Are any families ready to progress to `recommend_only`? Check that ranking computations have been stable and sensible for at least one week.
- [ ] **Recommend-only families:** Review the approval history. If recommendations have been consistently approved, consider upgrading to `auto_apply_low_risk`.
- [ ] **Auto-apply families:** Review auto-apply decision records. If there have been rollbacks or performance issues, consider downgrading to `recommend_only`.

### 2. Inspect Plateau Trends

- [ ] **Recurring plateaus:** Identify families that repeatedly enter plateau states. This may indicate that the candidate pool is too narrow or that the evaluation weights need adjustment.
- [ ] **Resolved plateaus:** Confirm that plateau signals have cleared for families where recommendations were applied.

### 3. Review Rollback History

Navigate to `/adaptation/rollbacks`:

- [ ] **Recent rollbacks:** Review any rollbacks performed in the past week. Identify root causes and determine if corrective action is needed.
- [ ] **Rollback patterns:** If the same family is being rolled back repeatedly, the underlying issue may be in the evaluation pipeline or provider stability rather than the ranking.

### 4. Escalation Tuning Review

- [ ] **Check tuning states:** For families with non-default escalation preferences, verify that the tuning is producing expected behavior.
- [ ] **Forced escalation compliance:** Confirm that all final and evidentiary posture families maintain `early_escalate` preference.

## Inspecting Plateau Signals

When investigating a plateau signal:

1. **Navigate to the family detail page** (`/adaptation/:familyKey`).
2. **Check metric trends:** Identify which metrics are stagnating or declining.
3. **Review candidate rankings:** Check if the top candidate has changed recently. If the same candidate has been selected for an extended period, the plateau may indicate that the candidate has reached its performance ceiling.
4. **Check the exploration rate:** If the exploration rate is very low, the optimizer may not be trying alternative candidates. Consider whether a recommendation to try a different candidate is warranted.
5. **Review recent adaptation events:** Check the adaptation event log for the family to see if recent changes correlate with the plateau onset.

## Reviewing Recommendations

When reviewing a pending recommendation:

1. **Read the evidence summary:** Understand what triggered the recommendation (plateau signal, trend data, scoring rationale).
2. **Compare rankings:** Review the current vs. proposed candidate ordering. Pay attention to which candidate is being promoted and which is being demoted.
3. **Check the family context:** Review the family's rolling score, trend, and recent failure count. A recommendation for a declining family with recent failures warrants extra scrutiny.
4. **Consider the adaptive mode:** If the family is in `recommend_only` mode, this is the only path for ranking changes. If the family is in `auto_apply_low_risk` mode and the recommendation was generated rather than auto-applied, it means the change did not meet the low-risk criteria.

## Approving Safely

- Provide a brief reason documenting why you are approving. This aids future audits.
- After approving, monitor the family's performance over the next few execution cycles to confirm the change had the intended effect.
- If performance degrades after approval, initiate a rollback promptly.

## Rejecting Safely

- Always provide a reason when rejecting. Common reasons:
  - "Insufficient evidence for the proposed change."
  - "Family is under active investigation; deferring changes."
  - "Proposed candidate has known stability issues."
- Rejection does not change the family's ranking. The next adaptation cycle may generate a new recommendation.

## Rolling Back Safely

1. **Preview first:** Always use the preview endpoint or the "Preview Rollback" button in the admin UI before executing.
2. **Check warnings:** If the preview shows warnings (e.g., stale target event), carefully consider whether the rollback is appropriate.
3. **Provide a reason:** Document why the rollback is being performed.
4. **Monitor after rollback:** Verify that the family's performance stabilizes after the rollback.
5. **Consider mode downgrade:** If a rollback was necessary, consider downgrading the family from `auto_apply_low_risk` to `recommend_only` until the root cause is understood.
