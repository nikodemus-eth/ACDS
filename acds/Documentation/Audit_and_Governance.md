# Audit and Governance

## Adaptation Audit Ledger
All adaptive changes must be logged. Each adaptation event records:
- event_type
- execution_family
- previous_strategy
- new_strategy
- evidence
- timestamp
- approval_mode
- rollback_reference

This ensures explainability.

## Policy Layers
Routing decisions obey layered policy.

### Global Policy
System-wide restrictions. Examples: high-consequence decisions require structured output; sensitive data may require local models.

### Application Policy
Per-application behavior. Example: Thingstead prefers local-first reasoning.

### Process Policy
Per-workflow defaults. Example: thingstead.control_review.decision → default_profile: local_balanced_reasoning

### Instance Policy
Runtime overrides based on: evidence completeness, retry count, human review status, deadline pressure.

## Execution Rationale Logging
Each cognitive call produces a rationale record:
- selected_profile
- decision_posture
- consequence
- traceability_required
- policy_match
- fallback_chain

This record supports governance and debugging.
