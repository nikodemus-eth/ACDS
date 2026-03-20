# ACDS Data Dictionary

## Storage Architecture

ACDS uses two distinct storage layers:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **PostgreSQL** | pg + PGlite (test) | Persistent state: providers, profiles, policies, execution records, audit trail, adaptation state |
| **In-Memory Registry** | TypeScript Maps | Sovereign runtime taxonomy: source definitions, method bindings, health state, telemetry events |

These layers are intentionally separated. PostgreSQL holds durable operational state. The in-memory registry holds the sovereign runtime's method-level dispatch model, which is rebuilt on startup from configuration.

---

## PostgreSQL Tables

### providers

Core provider registration. Every inference endpoint in the system.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique provider identifier |
| name | VARCHAR | NOT NULL | Human-readable name |
| vendor | VARCHAR | NOT NULL | ProviderVendor enum: `ollama`, `apple` |
| auth_type | VARCHAR | NOT NULL | AuthType enum: `none`, `api_key`, `bearer_token`, `custom` |
| base_url | VARCHAR | NOT NULL | API endpoint URL |
| enabled | BOOLEAN | NOT NULL | Active status |
| environment | VARCHAR | NOT NULL | Deployment environment |
| created_at | TIMESTAMPTZ | NOT NULL | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update timestamp |

**Relationships:** Has many `provider_health`, has one `provider_secrets`, referenced by `execution_records`.

---

### provider_health

Health monitoring state per provider.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| provider_id | UUID | FK → providers(id) | Provider reference |
| status | VARCHAR | NOT NULL | `healthy`, `degraded`, `unhealthy`, `unknown` |
| last_test_at | TIMESTAMPTZ | | Last health check |
| last_success_at | TIMESTAMPTZ | | Last successful call |
| last_failure_at | TIMESTAMPTZ | | Last failed call |
| latency_ms | INTEGER | | Measured latency |
| message | TEXT | | Status details |
| updated_at | TIMESTAMPTZ | NOT NULL | |

---

### provider_secrets

Encrypted API key storage using envelope encryption.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| provider_id | VARCHAR | UNIQUE | Provider reference |
| envelope | JSONB | NOT NULL | `{ciphertext, iv, authTag, keyId, algorithm}` |
| created_at | TIMESTAMPTZ | NOT NULL | |
| rotated_at | TIMESTAMPTZ | | Last key rotation |
| expires_at | TIMESTAMPTZ | | Expiration date |

---

### model_profiles

Model capability profiles — what each model can do, at what cost.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| name | VARCHAR | UNIQUE, NOT NULL | Profile name |
| description | TEXT | | |
| vendor | VARCHAR | NOT NULL | ProviderVendor |
| model_id | VARCHAR | NOT NULL | Vendor model identifier |
| supported_task_types | JSONB | NOT NULL | `TaskType[]` |
| supported_load_tiers | JSONB | NOT NULL | `LoadTier[]` |
| minimum_cognitive_grade | VARCHAR | NOT NULL | CognitiveGrade threshold |
| context_window | INTEGER | NOT NULL | Max context tokens |
| max_tokens | INTEGER | NOT NULL | Max generation tokens |
| cost_per_1k_input | NUMERIC | NOT NULL | Input token pricing |
| cost_per_1k_output | NUMERIC | NOT NULL | Output token pricing |
| local_only | BOOLEAN | NOT NULL | Local execution only |
| cloud_allowed | BOOLEAN | NOT NULL | Cloud execution allowed |
| enabled | BOOLEAN | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Relationships:** Referenced by `execution_records`, policies.

---

### tactic_profiles

Execution strategy profiles — how to execute a task.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| name | VARCHAR | UNIQUE, NOT NULL | Profile name |
| description | TEXT | | |
| execution_method | VARCHAR | NOT NULL | Execution strategy |
| system_prompt_template | TEXT | | Prompt template |
| output_schema | JSONB | | Structured output spec |
| max_retries | INTEGER | NOT NULL | |
| temperature | NUMERIC | NOT NULL | Sampling temperature |
| top_p | NUMERIC | NOT NULL | Nucleus sampling |
| supported_task_types | JSONB | NOT NULL | `TaskType[]` |
| supported_load_tiers | JSONB | NOT NULL | `LoadTier[]` |
| multi_stage | BOOLEAN | NOT NULL | Multi-stage execution |
| requires_structured_output | BOOLEAN | NOT NULL | |
| enabled | BOOLEAN | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

---

### execution_records

Every dispatched execution — the audit trail of what ran, how, and why.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| application | VARCHAR | NOT NULL | Execution family: application |
| process | VARCHAR | NOT NULL | Execution family: process |
| step | VARCHAR | NOT NULL | Execution family: step |
| decision_posture | VARCHAR | NOT NULL | `exploratory`, `advisory`, `operational`, `final`, `evidentiary` |
| cognitive_grade | VARCHAR | NOT NULL | `basic`, `standard`, `enhanced`, `frontier`, `specialized` |
| routing_decision_id | UUID | | Routing decision reference |
| selected_model_profile_id | UUID | | Chosen model |
| selected_tactic_profile_id | UUID | | Chosen tactic |
| selected_provider_id | UUID | | Chosen provider |
| status | VARCHAR | NOT NULL | `pending`, `running`, `succeeded`, `failed`, `fallback_succeeded`, `fallback_failed` |
| input_tokens | INTEGER | | Tokens consumed |
| output_tokens | INTEGER | | Tokens produced |
| latency_ms | INTEGER | | Execution duration |
| cost_estimate | NUMERIC | | Estimated cost |
| normalized_output | TEXT | | Normalized result |
| error_message | TEXT | | Error if failed |
| fallback_attempts | INTEGER | NOT NULL DEFAULT 0 | Fallback count |
| completed_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

### global_policies

Singleton global policy — system-wide defaults and constraints.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK (singleton) | |
| allowed_vendors | JSONB | | `ProviderVendor[]` |
| blocked_vendors | JSONB | | `ProviderVendor[]` |
| default_privacy | VARCHAR | | `local_only`, `cloud_allowed`, `cloud_preferred` |
| default_cost_sensitivity | VARCHAR | | `low`, `medium`, `high` |
| structured_output_required_for_grades | JSONB | | `CognitiveGrade[]` |
| traceability_required_for_grades | JSONB | | `CognitiveGrade[]` |
| max_latency_ms_by_load_tier | JSONB | | `Record<LoadTier, number>` |
| local_preferred_task_types | JSONB | | `TaskType[]` |
| cloud_required_load_tiers | JSONB | | `LoadTier[]` |
| enabled | BOOLEAN | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

---

### application_policies

Per-application policy overrides.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| application | VARCHAR | UNIQUE, NOT NULL | Application identifier |
| allowed_vendors | JSONB | | Override |
| blocked_vendors | JSONB | | Override |
| privacy_override | VARCHAR | | |
| cost_sensitivity_override | VARCHAR | | |
| preferred_model_profile_ids | JSONB | | `UUID[]` |
| blocked_model_profile_ids | JSONB | | `UUID[]` |
| local_preferred_task_types | JSONB | | |
| structured_output_required_for_grades | JSONB | | |
| enabled | BOOLEAN | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Relationships:** Inherits from `global_policies`, parent of `process_policies`.

---

### process_policies

Finest-grain policy — per application/process/step.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| application | VARCHAR | NOT NULL | |
| process | VARCHAR | NOT NULL | |
| step | VARCHAR | | NULL for process-level |
| default_model_profile_id | UUID | | Preferred model |
| default_tactic_profile_id | UUID | | Preferred tactic |
| allowed_model_profile_ids | JSONB | | |
| blocked_model_profile_ids | JSONB | | |
| allowed_tactic_profile_ids | JSONB | | |
| privacy_override | VARCHAR | | |
| cost_sensitivity_override | VARCHAR | | |
| force_escalation_for_grades | JSONB | | `CognitiveGrade[]` |
| enabled | BOOLEAN | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE(application, process, step)

---

### audit_events

Immutable audit trail for all system operations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| event_type | VARCHAR | NOT NULL | `provider`, `routing`, `execution`, `security`, `policy`, `system` |
| actor | VARCHAR | NOT NULL | Who triggered the event |
| action | VARCHAR | NOT NULL | Action performed |
| resource_type | VARCHAR | NOT NULL | Affected resource type |
| resource_id | VARCHAR | NOT NULL | Affected resource ID |
| application | VARCHAR | | Application context |
| details | JSONB | | Event-specific payload |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes:** event_type, created_at, application, (resource_type, resource_id)

---

### family_selection_states

Adaptive optimizer state per execution family.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| family_key | TEXT | PK | Composite: `app:process:step` |
| current_candidate_id | TEXT | NOT NULL | Selected candidate |
| rolling_score | NUMERIC | NOT NULL | Exponential weighted score (0–1) |
| exploration_rate | NUMERIC | NOT NULL | Exploration rate (0–1) |
| plateau_detected | BOOLEAN | NOT NULL | Performance plateau flag |
| last_adaptation_at | TEXT | | ISO-8601 timestamp |
| recent_trend | TEXT | NOT NULL | `improving`, `stable`, `declining` |

---

### candidate_performance_states

Per-candidate performance tracking within each family.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| candidate_id | TEXT | PK (composite) | `modelId:tacticId:providerId` |
| family_key | TEXT | PK (composite) | Execution family |
| rolling_score | NUMERIC | NOT NULL | Quality score (0–1) |
| run_count | INTEGER | NOT NULL | Total executions |
| success_rate | NUMERIC | NOT NULL | Success ratio (0–1) |
| average_latency | NUMERIC | NOT NULL | Mean latency ms |
| last_selected_at | TEXT | | ISO-8601 timestamp |

**Indexes:** family_key, (family_key, rolling_score DESC)

---

### adaptation_approval_records

Human-in-the-loop gates for adaptation recommendations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | |
| family_key | TEXT | NOT NULL | |
| recommendation_id | TEXT | NOT NULL | |
| status | TEXT | NOT NULL | `pending`, `approved`, `rejected`, `expired`, `superseded` |
| submitted_at | TEXT | NOT NULL | ISO-8601 |
| decided_at | TEXT | | |
| decided_by | TEXT | | |
| reason | TEXT | | |
| expires_at | TEXT | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

### adaptation_rollback_records

Rollback audit trail with before/after state snapshots.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | |
| family_key | TEXT | NOT NULL | |
| snapshot_id | TEXT | | Target rollback snapshot |
| reason | TEXT | NOT NULL | |
| executed_by | TEXT | NOT NULL | |
| executed_at | TIMESTAMPTZ | NOT NULL | |
| target_adaptation_event_id | TEXT | | |
| previous_snapshot | JSONB | NOT NULL | Pre-rollback `RankingSnapshot` |
| restored_snapshot | JSONB | NOT NULL | Post-rollback `RankingSnapshot` |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

### auto_apply_decision_records

Automatic low-risk adaptation decisions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | |
| family_key | TEXT | NOT NULL | |
| previous_ranking | JSONB | NOT NULL | `RankedCandidate[]` before |
| new_ranking | JSONB | NOT NULL | `RankedCandidate[]` after |
| reason | TEXT | NOT NULL | |
| mode | TEXT | NOT NULL | AdaptiveMode |
| risk_basis | TEXT | NOT NULL | FamilyRiskLevel |
| applied_at | TIMESTAMPTZ | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

### escalation_tuning_states

Per-family escalation preference tuning.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| family_key | TEXT | PK | |
| preference_level | TEXT | NOT NULL | `early_escalate`, `normal_escalate`, `delayed_escalate`, `local_preferred_until_fail` |
| last_tuned_at | TIMESTAMPTZ | | |
| local_success_rate | NUMERIC | | |
| cloud_success_rate | NUMERIC | | |

---

### admin_sessions

Admin authentication sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| session_token_hash | VARCHAR | UNIQUE | Hashed session token |
| actor | VARCHAR | NOT NULL | Admin actor |
| created_at | TIMESTAMPTZ | NOT NULL | |
| expires_at | TIMESTAMPTZ | NOT NULL | |

---

## In-Memory Registry (Sovereign Runtime)

These entities live in the `SourceRegistry` (Map-based) and are rebuilt from configuration on startup. They represent the sovereign runtime's method-level dispatch model.

### SourceDefinition (Discriminated Union)

Three mutually exclusive source classes. The `sourceClass` field is the discriminant.

#### ProviderDefinition (sourceClass = 'provider')

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique identifier (e.g. `apple-intelligence-runtime`) |
| name | string | Human-readable name |
| sourceClass | `'provider'` | Discriminant |
| deterministic | boolean | Produces deterministic output |
| localOnly | boolean | No network execution |
| providerClass | `'sovereign_runtime'` \| `'self_hosted'` \| `'managed_local'` | Sub-classification |
| executionMode | `'local'` \| `'controlled_remote'` | Execution location |

#### CapabilityDefinition (sourceClass = 'capability')

| Field | Type | Description |
|-------|------|-------------|
| id | string | e.g. `ollama-api` |
| name | string | |
| sourceClass | `'capability'` | Discriminant |
| deterministic | `false` (literal) | Always non-deterministic |
| explicitInvocationRequired | `true` (literal) | Never default-routed |
| vendor | string | External vendor name |

#### SessionDefinition (sourceClass = 'session')

| Field | Type | Description |
|-------|------|-------------|
| id | string | e.g. `ollama-session` |
| name | string | |
| sourceClass | `'session'` | Discriminant |
| explicitInvocationRequired | `true` (literal) | Never default-routed |
| riskLevel | `'high'` \| `'critical'` | Risk classification |
| requiresRiskAcknowledgment | `true` (literal) | Must be explicitly acknowledged |
| boundTo | string | Capability/vendor this session authenticates against |

---

### MethodDefinition

Each method registered to a provider. This is the routing unit — ACDS routes to methods, not providers.

| Field | Type | Description |
|-------|------|-------------|
| methodId | string | Fully qualified (e.g. `apple.foundation_models.summarize`) |
| providerId | string | Owning provider ID |
| subsystem | Subsystem | `foundation_models`, `writing_tools`, `speech`, `tts`, `vision`, `image_creator`, `translation`, `sound` |
| policyTier | PolicyTier | `A` (core), `B` (assistive), `C` (creative), `D` (external) |
| deterministic | boolean | |
| requiresNetwork | boolean | |
| inputSchema | ZodType | Runtime input validation |
| outputSchema | ZodType | Runtime output validation |

**20 Apple methods registered** across 8 subsystems.

---

### Telemetry Events (In-Memory)

#### ExecutionLogEvent

| Field | Type | Description |
|-------|------|-------------|
| executionId | string | |
| sourceType | SourceClass | `provider`, `capability`, `session` |
| sourceId | string | |
| providerId | string | |
| methodId | string | |
| executionMode | string | `local`, `controlled_remote`, `session` |
| latencyMs | number | |
| status | string | `success`, `failure`, `timeout` |
| validationResult | string? | `pass`, `fail`, `warn` |
| policyPath | string? | |
| timestamp | string | ISO-8601 |

#### PolicyAuditEvent

| Field | Type | Description |
|-------|------|-------------|
| executionId | string | |
| decision | string | `allow`, `deny` |
| reason | string | Explicit deny reason |
| sourceType | SourceClass | |
| methodId | string? | |
| timestamp | string | ISO-8601 |

#### FallbackAuditEvent

| Field | Type | Description |
|-------|------|-------------|
| executionId | string | |
| primaryProviderId | string | |
| primaryMethodId | string | |
| fallbackProviderId | string | |
| fallbackMethodId | string | |
| reason | string | |
| sameClass | boolean | Must always be `true` |
| timestamp | string | ISO-8601 |

---

## Enumerations

| Enum | Values | Used By |
|------|--------|---------|
| ProviderVendor | `ollama`, `apple` | Provider, ModelProfile |
| AuthType | `none`, `api_key`, `bearer_token`, `custom` | Provider |
| TaskType | `creative`, `analytical`, `extraction`, `classification`, `summarization`, `generation`, `reasoning`, `coding`, `decision_support`, `transformation`, `critique`, `planning`, `retrieval_synthesis` | ModelProfile, TacticProfile, Policies |
| LoadTier | `single_shot`, `batch`, `streaming`, `high_throughput` | ModelProfile, TacticProfile, Policies |
| CognitiveGrade | `basic`, `standard`, `enhanced`, `frontier`, `specialized` | ExecutionFamily, Policies |
| DecisionPosture | `exploratory`, `advisory`, `operational`, `final`, `evidentiary` | ExecutionFamily |
| ExecutionStatus | `pending`, `running`, `succeeded`, `failed`, `fallback_succeeded`, `fallback_failed` | ExecutionRecord |
| AuditEventType | `provider`, `routing`, `execution`, `security`, `policy`, `system` | AuditEvent |
| ProviderHealthStatus | `healthy`, `degraded`, `unhealthy`, `unknown` | ProviderHealth |
| PolicyTier | `A`, `B`, `C`, `D` | MethodDefinition (sovereign runtime) |
| SourceClass | `provider`, `capability`, `session` | SourceDefinition (sovereign runtime) |
