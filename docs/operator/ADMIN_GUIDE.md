# Admin Guide

The ACDS admin web interface (`apps/admin-web`) provides the operator-facing UI for configuring providers, managing policy, monitoring executions, and reviewing adaptive changes.

## Accessing the Admin Interface

Run the full stack with:

```bash
pnpm dev
```

The admin web application runs separately from the API and communicates over HTTP. Authentication is controlled by `ADMIN_SESSION_SECRET` and `ADMIN_SESSION_TTL_HOURS`.

For UI-only work, demos, or smoke checks without the API, run the admin app in mock mode:

```bash
pnpm --filter @acds/admin-web run dev:mock
```

See [Admin UI Development and Demo Mode](ADMIN_UI_DEVELOPMENT.md) for the full workflow.

## Providers Page

**Path:** `/providers`

The providers page lists all registered AI providers and gives operators the fastest path to add or disable provider connectivity.

### Provider List

The list view shows:

- Name
- Vendor
- Enabled status
- Environment
- Creation time

### Adding a Provider

Click the add button to open the provider form. Required fields:

- **Name** -- Human-readable identifier such as `Local Ollama` or `Apple Intelligence`
- **Vendor** -- Ollama or Apple Intelligence
- **Auth Type** -- None (both vendors are local providers)
- **Base URL** -- Provider endpoint
- **Environment** -- Development, staging, or production label for operator clarity
- **Secret** -- Only supplied during create; encrypted before storage

### Provider Detail

Click a provider row to view its detail page. The detail page shows:

- Provider configuration
- Current health state and recent test result
- Connection test controls
- Disable action to remove the provider from routing eligibility without deleting it

## Profiles Page

**Path:** `/profiles`

The profiles page manages model profiles and tactic profiles.

### Model Profiles

Model profiles define abstract cognitive capabilities. Operators can review or create model profiles with fields including:

- Cognitive grade
- Supported task types
- Supported load tiers
- Vendor association
- Capability flags such as local-only or cloud-allowed

### Tactic Profiles

Tactic profiles define how work should be executed. Operators can review or create tactic profiles with fields including:

- Execution method
- Supported task types
- Supported load tiers
- Multi-stage behavior

## Policies Page

**Path:** `/policies`

The policies page manages the three-level policy cascade.

### Global Policy

The global panel sets the system-wide baseline for:

- Allowed and blocked vendors
- Default privacy and cost sensitivity
- Default routing behavior
- Constraint objects such as latency ceilings

### Application Policies

Application policies override the global baseline for a named application such as `thingstead` or `process_swarm`.

### Process Policies

Process policies add narrower overrides for a specific process within an application.

## Adaptation Pages

**Paths:** `/adaptation`, `/adaptation/approvals`, `/adaptation/rollbacks`

The adaptation surface exposes family-level optimization state and the operator control loops around it.

### Family Performance

The main adaptation page lists execution families, rolling scores, trend direction, recent failure counts, and last update time. Selecting a family shows the candidate ranking and event history behind the current adaptive posture.

### Approval Queue

The approval queue lets operators:

- Filter recommendations by status
- Inspect ranking deltas and evidence
- Approve or reject changes with an operator reason

### Rollback Management

The rollback pages show rollback candidates and rollback history. Operators can preview a rollback before execution and must provide a reason when they execute one.

## Audit Page

**Path:** `/audit`

The audit page provides a filterable view of audit history.

Filter controls allow narrowing by:

- Event type
- Date range
- Actor
- Application

## Executions Page

**Path:** `/executions`

The executions page shows dispatch execution history.

### Execution List

The list view shows:

- Status
- Application
- Process
- Latency
- Fallback attempts
- Creation time

### Execution Detail

Selecting an execution shows:

- Routing selections
- Rationale summary
- Execution timing
- Result or failure details
- Fallback history when present

Older records may still show stable placeholder values for rationale or fallback metadata when those fields were not captured originally.
