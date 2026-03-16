# GRITS Implementation Specification

## 1. System Role

GRITS is a runtime verification subsystem responsible for detecting integrity violations in the Adaptive Cognitive Dispatch platform.

GRITS does not modify operational state.

GRITS reads state, evaluates invariants, and emits reports.

## 2. Deployment Position

GRITS runs as a worker service.

Example deployment:

```
apps/grits-worker
```

It shares database access with:

- dispatch system
- adaptive optimizer
- audit ledger

It must not import provider adapters or execution code.

## 3. GRITS Core Modules

GRITS consists of the following modules.

### BoundaryIntegrityChecker

Detects violations of architectural separation.

Checks:

- forbidden dependency imports
- routing decisions bypassing policy
- execution invoked outside orchestrator

### PolicyIntegrityChecker

Validates policy coherence.

Checks:

- conflicting policy overlays
- empty eligibility sets
- invalid profile references
- missing process policy definitions

### ExecutionIntegrityChecker

Verifies dispatch correctness.

Checks:

- selected candidate equals executed candidate
- fallback chain validity
- execution state transitions

### SecurityIntegrityChecker

Ensures secret safety.

Checks:

- logs for secret exposure
- audit events for credential fields
- API responses for secret fields

### AdaptiveIntegrityChecker

Ensures adaptive optimizer obeys constraints.

Checks:

- ranking restricted to eligible candidates
- auto-apply restrictions enforced
- exploration bounded by consequence level

### AuditIntegrityChecker

Ensures ledger completeness.

Checks:

- provider mutations recorded
- approval events recorded
- rollback events recorded
- adaptive events recorded

### OperationalIntegrityChecker

Monitors timing and job correctness.

Checks:

- worker job lag
- scoring pipeline completeness
- plateau detection integrity

## 4. GRITS Data Sources

GRITS queries the following tables or records:

- `executions`
- `routing_decisions`
- `execution_rationales`
- `provider_registry`
- `policies`
- `profiles`
- `execution_family_state`
- `candidate_performance_state`
- `adaptation_events`
- `approval_records`
- `rollback_snapshots`
- `audit_events`
- `worker_job_state`

## 5. Core Invariants

GRITS must enforce the following invariants.

**INV-001** — Execution must not occur outside eligibility bounds.

**INV-002** — Adaptive ranking must never select ineligible candidates.

**INV-003** — Approval-gated changes must have approval records.

**INV-004** — Rollback must restore valid policy-compliant state.

**INV-005** — Secrets must never appear in logs, API responses, or audit.

**INV-006** — Provider endpoints must pass safety validation.

**INV-007** — Critical mutations must produce audit records.

**INV-008** — Client metadata must not override authoritative policy posture.

## 6. GRITS Execution Cadence

GRITS runs three job classes.

### Fast Integrity Job

**Frequency:** every 1 hour

**Checks:**

- secret exposure
- approval anomalies
- execution state anomalies
- provider safety violations

### Daily Integrity Job

**Frequency:** once per day

**Checks:**

- adaptive drift
- fallback rate anomalies
- policy coherence
- rollback safety

Produces integrity snapshot.

### Release Verification Job

**Triggered by:**

- deployment
- migration
- configuration change

**Checks:**

- core invariants
- audit completeness
- adaptive control validity

## 7. GRITS Report Schema

GRITS produces structured reports.

Example structure:

```
IntegrityReport
  report_id
  timestamp
  system_version
  sections
    boundary_status
    policy_status
    execution_status
    adaptive_status
    audit_status
    security_status
    operational_status
  defects[]
```

## 8. Defect Record Schema

```
DefectRecord
  defect_id
  subsystem
  severity
  invariant_violated
  description
  evidence
  recommended_action
  requires_human_review
  timestamp
```

## 9. Severity Levels

| Severity | Meaning |
|----------|---------|
| Critical | Governance or security guarantee broken |
| High | Major correctness risk |
| Medium | Integrity degradation |
| Low | Minor issue |

## 10. Initial GRITS MVP

The MVP implementation must support:

- execution integrity verification
- adaptive integrity verification
- approval workflow verification
- rollback safety verification
- secret exposure detection
- audit completeness checks

These capabilities cover the most severe risks.

## 11. Integration with Dispatch Platform

GRITS interacts with the platform through:

- database read access
- audit event stream
- worker scheduler

It should not import internal logic of:

- routing engine
- optimizer
- provider adapters

This preserves independence.

## 12. Future Extensions

Possible enhancements include:

- anomaly detection for routing distribution
- statistical drift detection for adaptive scoring
- automated release readiness scoring
- GRITS dashboards in admin UI

## Final Summary

GRITS becomes the runtime guardian of platform integrity.

It continuously verifies that:

- policy remains enforced
- adaptation remains governed
- execution remains truthful
- secrets remain protected
- audit remains complete

Without GRITS, the system relies on trust.

With GRITS, the system verifies trust continuously.
