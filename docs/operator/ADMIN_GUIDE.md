# Admin Guide

The ACDS admin web interface (`apps/admin-web`) provides a management UI for configuring and monitoring the dispatch system. This guide covers each page and its primary operations.

## Accessing the Admin Interface

The admin web application runs as a separate frontend application that communicates with the API server. After starting the development environment with `pnpm dev`, the admin interface is available at the configured host and port.

Authentication is session-based, controlled by `ADMIN_SESSION_SECRET` and `ADMIN_SESSION_TTL_HOURS` in the environment configuration.

## Providers Page

**Path:** `/providers`

The providers page lists all registered AI providers with their current status.

### Provider List

Displays all providers in a data table with columns for name, vendor, status (healthy/degraded/offline), endpoint URL, and last health check time. Use the status badges to quickly identify providers that need attention.

### Adding a Provider

Click the add button to open the provider form. Required fields:

- **Name** -- A human-readable identifier (e.g., "Local Ollama", "Production OpenAI")
- **Vendor** -- Select from the supported vendors: Ollama, LM Studio, Gemini, OpenAI
- **Base URL** -- The provider's endpoint (e.g., `http://localhost:11434` for Ollama)
- **Auth Type** -- None (for local providers) or API Key (for cloud providers)
- **API Key** -- Required for cloud providers; encrypted before storage

### Provider Detail

Click a provider row to view its detail page. The detail page shows:

- Full configuration
- Health history via the `ProviderHealthPanel`
- Connection test results
- Recent audit events for this provider

## Profiles Page

**Path:** `/profiles`

The profiles page manages model profiles and tactic profiles.

### Model Profiles Panel

Lists all model profiles with their cognitive grade, supported task types, and associated vendor. Model profiles define abstract cognitive capabilities (e.g., `local_fast_advisory` for quick local inference, `cloud_frontier_reasoning` for high-complexity cloud tasks).

Use the profile form to create or edit model profiles. Key fields include cognitive grade, supported task types, vendor association, and capability flags.

### Tactic Profiles Panel

Lists all tactic profiles with their execution strategy. Tactic profiles define how a request should be executed (e.g., `single_pass_fast` for one-shot generation, `draft_then_critique` for iterative refinement).

## Policies Page

**Path:** `/policies`

The policies page manages the three-level policy cascade.

### Global Policy Panel

Displays and edits the system-wide global policy. The global policy sets the baseline for:

- Allowed and blocked vendors
- Default privacy mode (`local_only`, `cloud_allowed`, `cloud_preferred`)
- Default cost sensitivity
- Structured output and traceability requirements by cognitive grade
- Maximum latency by load tier
- Task types that prefer local providers
- Load tiers that require cloud providers

### Application Policy Panel

Lists per-application policy overrides. Each application (e.g., Thingstead, Process Swarm) can override global defaults for vendor lists, privacy, cost sensitivity, preferred/blocked model profiles, and structured output requirements.

### Process Policy Panel

Lists per-process (and optionally per-step) policy overrides. Process policies can specify default model and tactic profiles, restrict the allowed profile sets, override privacy and cost sensitivity, and force escalation for specific cognitive grades.

## Audit Page

**Path:** `/audit`

The audit page provides a filterable view of all audit events.

### Audit Table

Displays events in reverse chronological order with columns for timestamp, event type, action, resource, and actor. Filter controls allow narrowing by:

- Event type (provider, routing, execution, security, policy, system)
- Time range
- Correlation ID (to trace a single dispatch lifecycle)
- Resource type and ID

Click an event row to view the full event payload and metadata.

## Executions Page

**Path:** `/executions`

The executions page shows dispatch execution history.

### Execution List

Displays executions with status (pending, running, completed, failed), application, process, step, provider used, and timing information.

### Execution Detail

Click an execution row to view its detail page, which shows:

- The full routing decision (selected profiles, provider, rationale)
- The fallback chain and any fallback attempts that occurred
- Execution timing (start, end, total latency)
- The normalized result or failure details
- Linked audit events
