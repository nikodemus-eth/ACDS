# ACDS Entity Relationship Diagram

## Storage Boundary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           POSTGRESQL (Persistent)                          │
│                                                                             │
│  All durable operational state: providers, profiles, policies, executions,  │
│  audit trail, adaptation state, secrets                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        IN-MEMORY REGISTRY (Volatile)                       │
│                                                                             │
│  Sovereign runtime dispatch model: source definitions, method bindings,     │
│  health state, telemetry events. Rebuilt from config on startup.            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## PostgreSQL ERD

```
┌──────────────────────┐      ┌──────────────────────┐
│      providers       │      │   provider_health    │
├──────────────────────┤      ├──────────────────────┤
│ id           UUID PK │──┐   │ id           UUID PK │
│ name         VARCHAR │  │   │ provider_id  UUID FK │──┐
│ vendor       VARCHAR │  │   │ status       VARCHAR │  │
│ auth_type    VARCHAR │  ├──▶│ latency_ms   INT     │  │
│ base_url     VARCHAR │  │   │ last_test_at TSTZ    │  │
│ enabled      BOOL    │  │   │ message      TEXT    │  │
│ environment  VARCHAR │  │   └──────────────────────┘  │
│ created_at   TSTZ    │  │                              │
│ updated_at   TSTZ    │  │   ┌──────────────────────┐  │
└──────────────────────┘  │   │  provider_secrets     │  │
                          │   ├──────────────────────┤  │
                          └──▶│ id           UUID PK │  │
                              │ provider_id  VARCHAR  │──┘
                              │ envelope     JSONB    │
                              │ rotated_at   TSTZ     │
                              │ expires_at   TSTZ     │
                              └──────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│   model_profiles     │      │   tactic_profiles    │
├──────────────────────┤      ├──────────────────────┤
│ id           UUID PK │      │ id           UUID PK │
│ name         VARCHAR │      │ name         VARCHAR │
│ vendor       VARCHAR │      │ execution_method     │
│ model_id     VARCHAR │      │ system_prompt_tmpl   │
│ task_types   JSONB   │      │ output_schema JSONB  │
│ load_tiers   JSONB   │      │ task_types   JSONB   │
│ min_cog_grade VARCHAR│      │ load_tiers   JSONB   │
│ context_window INT   │      │ max_retries  INT     │
│ max_tokens   INT     │      │ temperature  NUMERIC │
│ cost_input   NUMERIC │      │ multi_stage  BOOL    │
│ cost_output  NUMERIC │      │ enabled      BOOL    │
│ local_only   BOOL    │      └──────────────────────┘
│ cloud_allowed BOOL   │               │
│ enabled      BOOL    │               │
└──────────────────────┘               │
         │                             │
         │         ┌───────────────────┘
         │         │
         ▼         ▼
┌──────────────────────────────────────┐
│          execution_records           │
├──────────────────────────────────────┤
│ id                    UUID PK        │
│ application           VARCHAR        │◄── ExecutionFamily
│ process               VARCHAR        │◄── (composite key
│ step                  VARCHAR        │◄──  for family)
│ decision_posture      VARCHAR        │
│ cognitive_grade       VARCHAR        │
│ routing_decision_id   UUID           │
│ selected_model_profile_id  UUID FK   │──▶ model_profiles
│ selected_tactic_profile_id UUID FK   │──▶ tactic_profiles
│ selected_provider_id  UUID FK        │──▶ providers
│ status                VARCHAR        │
│ input_tokens          INT            │
│ output_tokens         INT            │
│ latency_ms            INT            │
│ cost_estimate         NUMERIC        │
│ normalized_output     TEXT           │
│ error_message         TEXT           │
│ fallback_attempts     INT            │
│ created_at            TSTZ           │
└──────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                       POLICY HIERARCHY                       │
│                                                              │
│   global_policies (singleton)                                │
│        │                                                     │
│        ▼ inherits/overrides                                  │
│   application_policies (per application)                     │
│        │                                                     │
│        ▼ inherits/overrides                                  │
│   process_policies (per application/process/step)            │
│                                                              │
│   Each level can override: vendors, privacy, cost            │
│   sensitivity, model preferences, escalation rules           │
└──────────────────────────────────────────────────────────────┘

┌────────────────────────┐
│  global_policies       │
├────────────────────────┤
│ id             UUID PK │ (singleton)
│ allowed_vendors JSONB  │
│ blocked_vendors JSONB  │
│ default_privacy VARCHAR│
│ default_cost    VARCHAR│
│ enabled         BOOL   │
└────────────────────────┘
         │
         ▼
┌────────────────────────┐
│ application_policies   │
├────────────────────────┤
│ id          UUID PK    │
│ application VARCHAR UQ │
│ allowed_vendors  JSONB │
│ privacy_override VARCHAR│
│ preferred_models JSONB │
│ enabled     BOOL       │
└────────────────────────┘
         │
         ▼
┌────────────────────────┐
│  process_policies      │
├────────────────────────┤
│ id          UUID PK    │
│ application VARCHAR    │
│ process     VARCHAR    │
│ step        VARCHAR    │ (nullable)
│ default_model_id UUID  │──▶ model_profiles
│ default_tactic_id UUID │──▶ tactic_profiles
│ privacy_override VARCHAR│
│ enabled     BOOL       │
├────────────────────────┤
│ UQ(app, process, step) │
└────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                   ADAPTATION OPTIMIZER STATE                  │
│                                                              │
│  family_selection_states ◄──── 1:M ────► candidate_perf_states│
│       (per family)                       (per candidate)     │
│                                                              │
│  adaptation_approval_records    (human-in-the-loop gates)    │
│  adaptation_rollback_records    (rollback audit + snapshots) │
│  auto_apply_decision_records    (automatic low-risk changes) │
│  escalation_tuning_states       (escalation preferences)     │
└──────────────────────────────────────────────────────────────┘

┌───────────────────────────┐     ┌───────────────────────────┐
│ family_selection_states   │     │ candidate_performance     │
├───────────────────────────┤     │       _states             │
│ family_key      TEXT PK   │◄───┤───────────────────────────┤
│ current_candidate TEXT    │     │ candidate_id  TEXT   PK   │
│ rolling_score   NUMERIC   │     │ family_key    TEXT   PK   │
│ exploration_rate NUMERIC  │     │ rolling_score NUMERIC     │
│ plateau_detected BOOL     │     │ run_count     INT         │
│ recent_trend    TEXT      │     │ success_rate  NUMERIC     │
└───────────────────────────┘     │ average_latency NUMERIC   │
         │                        └───────────────────────────┘
         │
    ┌────┴──────────────────┐
    │                       │
    ▼                       ▼
┌─────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐
│ adaptation      │  │ adaptation_rollback  │  │ auto_apply_decision  │
│ _approval_recs  │  │ _records             │  │ _records             │
├─────────────────┤  ├─────────────────────┤  ├──────────────────────┤
│ id        PK    │  │ id            PK    │  │ id           PK      │
│ family_key      │  │ family_key          │  │ family_key           │
│ rec_id          │  │ prev_snapshot JSONB │  │ prev_ranking JSONB   │
│ status          │  │ restored_snap JSONB │  │ new_ranking  JSONB   │
│ decided_by      │  │ reason              │  │ reason               │
│ reason          │  │ executed_by         │  │ mode                 │
│ expires_at      │  │ executed_at         │  │ applied_at           │
└─────────────────┘  └─────────────────────┘  └──────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                        AUDIT TRAIL                           │
└──────────────────────────────────────────────────────────────┘
┌────────────────────────┐
│     audit_events       │
├────────────────────────┤
│ id          UUID PK    │
│ event_type  VARCHAR    │  provider | routing | execution |
│ actor       VARCHAR    │  security | policy  | system
│ action      VARCHAR    │
│ resource_type VARCHAR  │
│ resource_id VARCHAR    │
│ application VARCHAR    │
│ details     JSONB      │
│ created_at  TSTZ       │
└────────────────────────┘
  Indexes: event_type, created_at, application, (resource_type, resource_id)


┌────────────────────────┐
│   admin_sessions       │
├────────────────────────┤
│ id              UUID PK│
│ session_token_hash     │
│ actor           VARCHAR│
│ expires_at      TSTZ   │
└────────────────────────┘
```

---

## In-Memory Registry ERD (Sovereign Runtime)

```
┌──────────────────────────────────────────────────────────────┐
│                      SOURCE REGISTRY                         │
│                    (Map<string, RegistryEntry>)               │
└──────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐
  │  SourceDefinition   │ ◄── Discriminated union on sourceClass
  │  (3 variants)       │
  ├─────────────────────┤
  │                     │
  │  ┌─────────────┐   │     ┌─────────────────────────┐
  │  │  Provider    │───┼────▶│    MethodDefinition     │
  │  │  Definition  │   │  M  ├─────────────────────────┤
  │  ├─────────────┤   │     │ methodId       string    │
  │  │ deterministic│   │     │ providerId     string    │──▶ Provider
  │  │ localOnly    │   │     │ subsystem      Subsystem │
  │  │ providerClass│   │     │ policyTier     A|B|C|D   │
  │  │ executionMode│   │     │ deterministic  boolean   │
  │  └─────────────┘   │     │ requiresNetwork boolean  │
  │                     │     │ inputSchema    Zod       │
  │  ┌─────────────┐   │     │ outputSchema   Zod       │
  │  │ Capability  │   │     └─────────────────────────┘
  │  │ Definition  │   │
  │  ├─────────────┤   │
  │  │ vendor      │   │     Apple Sovereign Runtime Methods:
  │  │ explicit    │   │     ┌─────────────────────────────────┐
  │  │ Invocation  │   │     │ foundation_models (Tier A)      │
  │  └─────────────┘   │     │  .generate  .summarize  .extract│
  │                     │     │ writing_tools (Tier B)          │
  │  ┌─────────────┐   │     │  .rewrite  .proofread  .summ.  │
  │  │  Session    │   │     │ speech (Tier A)                 │
  │  │ Definition  │   │     │  .transcribe_file  .trans_live  │
  │  ├─────────────┤   │     │  .transcribe_longform  .dict.  │
  │  │ riskLevel   │   │     │ tts (Tier A)                   │
  │  │ requiresRisk│   │     │  .speak  .render_audio          │
  │  │ boundTo     │   │     │ vision (Tier A)                │
  │  └─────────────┘   │     │  .ocr  .document_extract        │
  │                     │     │ image_creator (Tier C)          │
  └─────────────────────┘     │  .generate                     │
                              │ translation (Tier A)            │
                              │  .translate                     │
                              │ sound (Tier A)                  │
                              │  .classify                      │
                              └─────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                   TELEMETRY EVENTS (In-Memory)               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ExecutionLogEvent ──────▶ Every method execution            │
│  PolicyAuditEvent  ──────▶ Every policy allow/deny           │
│  FallbackAuditEvent ─────▶ Every fallback trigger            │
│                                                              │
│  All events pass through redaction layer before storage.     │
│  All events include: executionId, sourceType, timestamp      │
└──────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                  EXECUTION PIPELINE FLOW                      │
│                                                              │
│  Request                                                     │
│    → IntentResolver (task text → structured intent)          │
│    → MethodResolver (intent → MethodDefinition)              │
│    → PolicyEngine   (request + method → allow/deny)          │
│    → ExecutionPlanner (method + class → plan + fallback)     │
│    → ProviderRuntime  (plan → execute → result)              │
│    → GRITSHookRunner  (result → validate → warnings)        │
│    → ResponseAssembler (result + metadata → response)        │
│  Response                                                    │
└──────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                    CLASS BOUNDARY RULES                       │
│                                                              │
│  Provider ──fallback──▶ Provider       ✓ ALLOWED             │
│  Provider ──fallback──▶ Capability     ✗ BLOCKED             │
│  Provider ──fallback──▶ Session        ✗ BLOCKED             │
│  Capability ─fallback─▶ anything       ✗ BLOCKED (isolated)  │
│  Session ───fallback──▶ anything       ✗ BLOCKED (isolated)  │
│                                                              │
│  Cross-class fallback NEVER occurs. Enforced by PolicyEngine │
│  and ExecutionPlanner. Validated by GRITS adversarial tests. │
└──────────────────────────────────────────────────────────────┘
```

---

## Cross-Layer Relationships

```
PostgreSQL                          In-Memory Registry
──────────                          ──────────────────

providers.vendor='apple'  ◄────────▶  ProviderDefinition
                                       id='apple-intelligence-runtime'
                                       ├── 20 MethodDefinitions
                                       └── HealthState (live)

execution_records         ◄────────── ExecutionLogEvent
  (persisted)                          (emitted per execution)

audit_events              ◄────────── PolicyAuditEvent
  (persisted)                          FallbackAuditEvent
                                       (emitted per decision)

global_policies           ────────▶  PolicyEngine reads at startup
application_policies                  to configure sovereign runtime
process_policies                      policy enforcement
```
