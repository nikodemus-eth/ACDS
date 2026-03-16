# GRITS Invariant Catalog

## Overview

GRITS enforces 8 core invariants that define the integrity contract of the Adaptive Cognitive Dispatch platform. Each invariant is evaluated by one or more checker modules at specified cadences. A violation produces a `DefectReport` with severity, evidence, and recommended remediation.

## Invariant Table

| ID | Description | Checker(s) | Severity Range | Cadences |
|----|-------------|-----------|----------------|----------|
| INV-001 | No execution path bypasses eligibility check | ExecutionIntegrityChecker, BoundaryIntegrityChecker, PolicyIntegrityChecker | high -- critical | fast, daily, release |
| INV-002 | Fallback chain never escapes policy bounds | ExecutionIntegrityChecker | high | fast, daily, release |
| INV-003 | Adaptive selection cannot touch ineligible candidates | AdaptiveIntegrityChecker | critical -- high | fast, daily, release |
| INV-004 | Approval/rollback state machines reject invalid transitions | AdaptiveIntegrityChecker | high | fast, daily, release |
| INV-005 | No plaintext secret exposure in audit events, execution data, or routing rationale | SecurityIntegrityChecker | critical | daily, release |
| INV-006 | Provider endpoints restricted to safe schemes/hosts | SecurityIntegrityChecker | high -- critical | daily, release |
| INV-007 | Every control action has complete audit trail with valid actors | AuditIntegrityChecker | medium -- high | daily, release |
| INV-008 | Client metadata valid, operational health within bounds | OperationalIntegrityChecker | low -- high | daily, release |

## Invariant Details

### INV-001 — No execution path bypasses eligibility check

**What it protects:** The guarantee that every execution was routed through the policy engine and only eligible candidates were considered.

**How it is checked:**

- `ExecutionIntegrityChecker` compares executed candidates against recorded routing decisions, verifies the selected candidate matches the executed candidate, and independently recomputes eligibility by loading stored policy (global/application/process) and verifying provider vendor, model profile, and tactic profile against policy constraints.
- `BoundaryIntegrityChecker` verifies that no execution references a disabled or unknown provider, and checks audit event coherence to detect layer-collapse scenarios where subsystem actions reference resources outside their expected domain boundary.
- `PolicyIntegrityChecker` validates that routing decisions reference valid, non-conflicting policies.

**Severity:** high for routing mismatches, critical for complete policy bypass.

**Cadences:** fast (hourly sampling), daily (full sweep), release (complete verification).

### INV-002 — Fallback chain never escapes policy bounds

**What it protects:** The guarantee that fallback execution follows the same eligibility constraints as primary execution.

**How it is checked:**

- `ExecutionIntegrityChecker` validates that every candidate in a fallback chain was marked eligible by the routing decision.

**Severity:** high. Fallback policy escape is a correctness risk but typically not a security breach.

**Cadences:** fast, daily, release.

### INV-003 — Adaptive selection cannot touch ineligible candidates

**What it protects:** The guarantee that the adaptive optimizer only ranks and selects candidates that passed eligibility checks.

**How it is checked:**

- `AdaptiveIntegrityChecker` cross-references optimizer ranking state against eligibility lists from routing decisions.

**Severity:** critical when an ineligible candidate is actively selected, high when ineligible candidates appear in ranking state but are not yet selected.

**Cadences:** fast, daily, release.

### INV-004 — Approval/rollback state machines reject invalid transitions

**What it protects:** The guarantee that approval workflows and rollback operations follow valid state transitions and cannot be bypassed.

**How it is checked:**

- `AdaptiveIntegrityChecker` validates that approval-gated changes have corresponding approval records and that rollback operations restore policy-compliant state.

**Severity:** high. Invalid state transitions indicate workflow integrity failure.

**Cadences:** fast, daily, release.

### INV-005 — No plaintext secret exposure in audit events, execution data, or routing rationale

**What it protects:** The guarantee that API keys, tokens, passwords, and private keys never appear in audit event details, execution error messages, execution normalized output, or routing decision rationale summaries.

**How it is checked:**

- `SecurityIntegrityChecker` scans audit event detail fields against known secret patterns (OpenAI-style keys, Bearer tokens, generic API keys, passwords, PEM private keys).
- When provided with ExecutionRecordReadRepository, also scans execution `errorMessage` and `normalizedOutput` fields — the most common vectors for accidental secret leakage.
- When provided with RoutingDecisionReadRepository, also scans routing decision `rationaleSummary` fields.

**Severity:** critical. Secret exposure is a security guarantee violation.

**Cadences:** daily (24-hour window), release (7-day window).

### INV-006 — Provider endpoints restricted to safe schemes/hosts

**What it protects:** The guarantee that registered provider base URLs use HTTPS and do not target localhost, link-local, or metadata service addresses.

**How it is checked:**

- `SecurityIntegrityChecker` parses each provider's `baseUrl`, verifies the scheme is `https:`, and checks the hostname against unsafe host patterns (localhost, 127.0.0.1, 0.0.0.0, ::1, 169.254.x.x).

**Severity:** high for HTTP or unsafe hosts, critical for non-HTTP/HTTPS schemes.

**Cadences:** daily, release.

### INV-007 — Every control action has complete audit trail with valid actors

**What it protects:** The guarantee that provider mutations, approval events, rollback events, and adaptive ranking changes all have corresponding audit records with proper actor attribution.

**How it is checked:**

- `AuditIntegrityChecker` cross-references execution records, approval records, and mutation events against the audit event stream to detect missing entries.
- Verifies terminal approval states (approved, rejected, expired) have corresponding terminal audit events, not just submission events.
- Validates actor field presence on all audit events — empty or "unknown" actors indicate non-attributable control actions.
- Verifies fallback executions (fallback_succeeded, fallback_failed) have audit events specifically referencing fallback behavior.

**Severity:** high for missing audit events, medium for missing actors or fallback audit gaps.

**Cadences:** daily, release.

### INV-008 — Client metadata valid, operational health within bounds

**What it protects:** The guarantee that client-supplied metadata cannot override authoritative policy, and that operational metrics (latency, execution lifecycle, temporal continuity) remain within healthy bounds.

**How it is checked:**

- `OperationalIntegrityChecker` validates DecisionPosture and CognitiveGrade enum values.
- Detects negative latency values (clock skew or data corruption — HIGH severity).
- Flags anomalously high latency >5 minutes (MEDIUM severity).
- Detects completed executions missing `completedAt` timestamps (HIGH severity).
- Detects stale executions stuck in pending/running for >1 hour (MEDIUM severity).
- Detects execution gaps >4 hours between consecutive records (LOW severity).

**Severity:** high for data corruption and lifecycle violations, medium for anomalies and staleness, low for temporal gaps.

**Cadences:** daily, release.

## Severity Reference

| Severity | Meaning | Example |
|----------|---------|---------|
| critical | Governance or security guarantee broken | Secret in audit log, ineligible candidate executed |
| high | Major correctness risk | Fallback escapes policy, missing audit trail |
| medium | Integrity degradation | Invalid client metadata enum values |
| low | Minor inconsistency, no immediate impact | Stale cache entry |
| info | Informational finding, no action required | Unusual but valid pattern |
