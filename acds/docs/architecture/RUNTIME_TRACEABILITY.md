# Runtime Traceability

This document maps ACDS runtime behavior to the persisted evidence used for audit, operator inspection, and GRITS release checks.

## Dispatch and Execution

- Primary execution record surface: `execution_records`
- Runtime owner: execution orchestrator plus `ExecutionStatusTracker`
- Persisted evidence:
  - request context and routing request payload
  - selected provider and model profile identifiers
  - execution status transitions
  - execution output or failure details
  - timestamps used for sequencing and GRITS integrity checks

## Routing Rationale

- Current MVP posture persists routing evidence on execution records and related audit events rather than a dedicated routing decision table
- Persisted evidence:
  - selected provider and fallback chain information on execution state
  - rationale-bearing audit events emitted during route resolution
  - resolved policy context as captured by the dispatch path

## Fallback Behavior

- Fallback behavior is evidenced through:
  - execution record status/output updates
  - audit events for fallback-triggered execution paths
  - provider and routing context captured in the execution lifecycle
- GRITS uses the execution and audit surfaces to verify that fallback remained bounded and inspectable

## Audit Surfaces

- Primary audit surface: `audit_events`
- Persisted evidence:
  - route resolution events
  - execution start, completion, and failure events
  - adaptation approval and rollback events where applicable
- Operator-facing inspection paths:
  - `GET /audit`
  - admin UI audit views

## Adaptation and Rollback Posture

- MVP posture is observe-first
- Persisted evidence used today:
  - adaptation events and recommendations
  - rollback records and rollback-related audit events
  - optimizer state and family/candidate performance state
- Release caveat:
  - adaptation is inspectable and persisted, but production auto-apply posture should remain constrained until environment-specific policy validation is complete

## GRITS Release Gate Inputs

The DB-backed GRITS path reads persisted runtime state rather than fixture-only state. The primary evidence sources are:

- `execution_records`
- `audit_events`
- adaptation and rollback state tables
- integrity snapshot storage used to retain GRITS outputs

See [../grits/SCHEMA_MAPPING.md](../grits/SCHEMA_MAPPING.md) for the table-level mapping used by the release gate.
