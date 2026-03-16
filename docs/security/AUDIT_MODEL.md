# Audit Model

ACDS maintains an append-oriented audit ledger that records every significant event in the system. Audit events provide traceability from a routing request through to its final execution outcome.

## Event Types

The `AuditEventType` enum defines six categories:

| Type        | Purpose                                                             |
| ----------- | ------------------------------------------------------------------- |
| `provider`  | Provider lifecycle: registration, configuration changes, connection tests, health status changes |
| `routing`   | Routing decisions: policy resolution, profile eligibility, selection rationale, fallback chain composition |
| `execution` | Execution lifecycle: start, completion, failure, fallback attempts, result normalization |
| `security`  | Security operations: secret encryption, decryption, rotation, redaction failures, access control events |
| `policy`    | Policy changes: creation, update, deletion, conflict detection, cascade resolution |
| `system`    | System operations: startup, shutdown, configuration changes, health check scheduling, background job execution |

## Event Structure

Every audit event conforms to the `AuditEvent` interface and is normalized via `normalizeAuditEvent` before persistence:

| Field           | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| `id`            | Unique event identifier                                       |
| `type`          | One of the `AuditEventType` values                            |
| `action`        | Specific action within the type (e.g., `routing.decision_resolved`) |
| `timestamp`     | When the event occurred (UTC)                                 |
| `correlationId` | Links related events across the dispatch lifecycle            |
| `actorId`       | Who or what initiated the action (user, system, application)  |
| `resourceType`  | The type of resource affected (e.g., `provider`, `execution`) |
| `resourceId`    | The ID of the affected resource                               |
| `payload`       | Type-specific event data (always redacted of secrets)         |
| `metadata`      | Additional context (request IDs, session IDs, version info)   |

## Event Builders

Dedicated builder functions construct audit events with the correct structure for each domain:

- **`buildProviderEvent`** -- Creates events for provider operations. Includes provider ID, vendor, operation type, and outcome.
- **`buildRoutingEvent`** -- Creates events for routing decisions. Includes the routing request summary, selected profiles, fallback chain, and rationale reference.
- **`buildExecutionEvent`** -- Creates events for execution lifecycle. Includes execution record ID, status transitions, provider used, latency, and fallback attempts.

## Audit Writers

Each domain has a dedicated writer that wraps the builder and handles persistence:

- **`ProviderAuditWriter`** -- Writes provider events
- **`RoutingAuditWriter`** -- Writes routing events
- **`ExecutionAuditWriter`** -- Writes execution events

All writers implement the `AuditEventWriter` interface, which defines the `write(event: AuditEvent): Promise<void>` contract.

## Traceability Guarantees

The audit model provides the following traceability guarantees:

1. **Request-to-result tracing.** Every `RoutingRequest` that enters the system produces a routing audit event. Every execution produces an execution audit event. Both share a `correlationId`, allowing the full lifecycle to be reconstructed.

2. **Fallback visibility.** When fallback occurs, each attempt is recorded as a separate audit event linked by the same `correlationId`. The final execution event includes a summary of all fallback attempts.

3. **Policy attribution.** Routing audit events include which policies were active and how they influenced the decision. If a global policy blocked a vendor or a process policy forced a specific profile, that is recorded.

4. **Rationale linkage.** The routing decision's `rationaleId` links to the full rationale record, which explains the eligibility computation and selection logic in human-readable form.

## Adaptation Audit Emitters

In addition to domain audit writers, the adaptation subsystem uses specialized emitters for approval and rollback events:

- **`PgApprovalAuditEmitter`** -- Writes approval lifecycle events (`approval_submitted`, `approval_approved`, `approval_rejected`, `approval_expired`) to the `audit_events` table with `resource_type = 'approval'`.
- **`PgRollbackAuditEmitter`** -- Writes rollback events (`rollback_previewed`, `rollback_executed`) to the `audit_events` table with `resource_type = 'rollback'`.

Both emitters use **fire-and-forget** semantics: the database write is non-blocking and failures are logged to stderr without interrupting the critical path. This ensures audit persistence does not become a bottleneck or single point of failure for adaptation operations.

## Storage Model

Audit events are stored in the `audit_events` table (migration 006):

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Auto-generated primary key |
| `event_type` | VARCHAR | The audit event type or adaptation event type |
| `actor` | VARCHAR | Who initiated the action |
| `action` | VARCHAR | The specific action performed |
| `resource_type` | VARCHAR | Type of resource affected (provider, approval, rollback, etc.) |
| `resource_id` | VARCHAR | ID of the affected resource |
| `application` | VARCHAR | Application context (optional) |
| `details` | JSONB | Type-specific event payload |
| `created_at` | TIMESTAMPTZ | When the event was recorded |

Audit events are append-oriented:

- Events are written but never updated or deleted.
- The normalized event structure (`NormalizedAuditEvent`) is designed for efficient querying by type, correlation ID, time range, and resource.
- The admin web interface provides a filterable audit table for browsing events.
- Retention policies are configured at the infrastructure level (database or log storage), not within the application.
