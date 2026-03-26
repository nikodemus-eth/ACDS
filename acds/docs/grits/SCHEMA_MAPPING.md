# GRITS Schema Mapping

## Strategy

ACDS MVP uses **direct table mapping** for the GRITS live path unless a compatibility layer is explicitly documented. No read-only compatibility views are required in the current MVP schema.

## Repository to Schema Mapping

| GRITS Read Surface | Backing Table(s) | Strategy | Notes |
|---|---|---|---|
| Execution records | `execution_records` | Direct mapping | Migration `009` aligns runtime columns with the execution repository contract |
| Routing decisions | `execution_records.routing_decision` and `routing_decision_id` | SQL adaptation | Decisions are reconstructed from persisted JSONB on execution rows |
| Audit events | `audit_events` | Direct mapping | Routing/execution lifecycle is written as structured audit events |
| Adaptation approvals | `adaptation_approval_records` | Direct mapping | Used by adaptive and audit checks |
| Rollbacks | `adaptation_rollback_records` | Direct mapping | Reads `target_adaptation_event_id`, snapshots, actor, and reason |
| Optimizer family state | `family_selection_states` | Direct mapping | Used by adaptive checks |
| Candidate performance | `candidate_performance_states` | Direct mapping | Read through optimizer repository |
| Providers | `providers` | Direct mapping | Used by execution, boundary, policy, security, and Apple checks |
| GRITS snapshots | `integrity_snapshots` | Direct mapping | GRITS-only write surface |
| Adaptation event ledger | `auto_apply_decision_records` | SQL adaptation | Read-only proxy for release integrity checks in MVP |

## Unsupported for MVP

- Worker job state as a first-class persisted GRITS read surface
- Arbitrary external schema forks without migration alignment

## Integrity Claims Backed by Persistence

- execution lifecycle
- selected provider/profile/tactic IDs
- routing decision payload
- audit events
- rollback snapshots
- approval state
- optimizer family and candidate state
