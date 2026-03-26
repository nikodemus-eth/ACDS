# Adaptive Cognitive Dispatch System

A **governed, local-first cognitive dispatch platform** for routing AI work across approved providers with policy controls, auditability, adaptive optimization, and an operator-facing integrity gate.

## Install Contract

ACDS is a `pnpm` workspace and treats `pnpm` as a hard requirement.

- Required runtime: Node `>=20.0.0`
- Required package manager: `pnpm >=9.0.0`
- Recommended activation path: `corepack enable` followed by `corepack prepare pnpm@9.15.0 --activate`
- Unsupported install path: `npm install`

The workspace depends on `workspace:*` links across apps and packages, so a successful `pnpm` install is part of the product contract rather than a convenience detail.

## What It Does

ACDS sits between your applications and AI providers. Instead of hardcoding which model to call, your application declares a **cognitive intent** -- what kind of thinking is needed -- and ACDS determines the best model, execution tactic, and provider to handle the request. Every decision is policy-governed, auditable, and resilient through automatic fallback.

## Why It Exists

Applications like **Thingstead** (governance) and **Process Swarm** (content generation) need AI capabilities but should not be tightly coupled to specific vendors or models. ACDS provides:

- **Vendor independence.** Applications describe intent, not providers. Switch between approved providers without changing application code.
- **Policy governance.** A three-level policy cascade (global, application, process) controls which vendors, models, and tactics are allowed for each request.
- **Automatic fallback.** If the primary provider fails, execution continues through a pre-computed fallback chain.
- **Full auditability.** Every routing decision and execution is recorded with a human-readable rationale explaining why each choice was made.
- **Adaptive optimization.** The system learns from execution outcomes to improve routing over time, within policy bounds.

## MVP Support Posture

ACDS `v0.1.0` is **ACDS-first, local-first, and operator-oriented**.

- Supported now: PostgreSQL-backed API, admin UI, worker services, provider registration, policy/routing, audit persistence, and GRITS DB-backed release checks
- Supported providers for MVP: **Ollama** and **LM Studio**
- Experimental providers: **OpenAI**, **Gemini**, **Apple Intelligence**
- Adaptation posture: **observe-first**. Adaptive state is persisted and inspected, but operators should treat automatic adaptation as controlled/limited until their environment-specific policies are validated

See [docs/MVP_BOUNDARY.md](docs/MVP_BOUNDARY.md) for the exact release boundary.

## Integration with Thingstead and Process Swarm

Applications integrate through the `@acds/sdk` package:

```typescript
import { DispatchClient, RoutingRequestBuilder } from '@acds/sdk';

const client = new DispatchClient({ baseUrl: 'http://localhost:3000' });

const request = new RoutingRequestBuilder()
  .application('process_swarm')
  .process('content_review')
  .step('initial_draft')
  .taskType('generation')
  .cognitiveGrade('standard')
  .build();

const result = await client.dispatch(request);
```

The SDK provides builders for constructing routing requests and helpers for load classification, posture defaults, and structured output flags. Applications never specify a vendor or model directly.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Application Layer                    │
│         (Thingstead, Process Swarm)               │
└────────────────────┬────────────────────────────┘
                     │ cognitive intent
┌────────────────────▼────────────────────────────┐
│           Cognitive Dispatch Layer                │
│  routing-engine │ policy-engine │ SDK             │
└────────────────────┬────────────────────────────┘
                     │ routing decision
┌────────────────────▼────────────────────────────┐
│         Execution Orchestrator                    │
│     run │ fallback │ lifecycle tracking           │
└────────────────────┬────────────────────────────┘
                     │ normalized execution
┌────────────────────▼────────────────────────────┐
│            Provider Broker                        │
│   registry │ execution proxy │ health             │
└────────────────────┬────────────────────────────┘
                     │ adapter contract
┌────────────────────▼────────────────────────────┐
│          Provider Adapters                        │
│   Ollama │ LM Studio │ Gemini │ OpenAI           │
└─────────────────────────────────────────────────┘
```

Dependencies flow strictly downward. Each layer depends only on the layers below it, enforced through the package dependency graph:

`core-types` -> `security` -> `audit-ledger` -> `provider-adapters` -> `provider-broker` -> `policy-engine` -> `routing-engine` -> `execution-orchestrator` -> `sdk` -> `apps`

## Top-Level Structure

```
adaptive-cognitive-dispatch/
├── apps/
│   ├── api/              # HTTP API server (Fastify)
│   ├── admin-web/        # Admin management UI (React)
│   └── worker/           # Background job processor
├── packages/
│   ├── core-types/       # Canonical types, enums, contracts
│   ├── security/         # Crypto, secrets, redaction
│   ├── audit-ledger/     # Audit event writing and normalization
│   ├── provider-adapters/ # Provider-specific adapters
│   ├── provider-broker/  # Provider registry, execution, health
│   ├── policy-engine/    # Policy models and resolution
│   ├── routing-engine/   # Route intake, eligibility, selection
│   ├── execution-orchestrator/ # Run coordination, fallback, lifecycle
│   ├── sdk/              # Application-facing client SDK
│   ├── evaluation/       # Metrics, scoring, aggregation
│   ├── adaptive-optimizer/ # Adaptive state, ranking, plateau detection
│   └── shared-utils/     # Cross-cutting utilities
├── infra/
│   ├── db/               # Migrations and seeds
│   ├── docker/           # Container definitions
│   ├── config/           # Profile and policy configs
│   └── scripts/          # Operational scripts
├── docs/                 # Architecture, security, and operator docs
└── tests/                # Integration and scenario tests
```

## Quick Start

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate

# Install and verify the workspace
pnpm run bootstrap

# Set up environment
cp .env.example .env
# Edit .env with your configuration (database URL, master key path, etc.)

# Run database migrations
pnpm --filter @acds/db-tools run migrate

# Seed baseline profiles and policies
pnpm --filter @acds/db-tools run seed

# Start the supported MVP surface
pnpm --filter @acds/api run start
pnpm --filter @acds/admin-web run preview -- --host 0.0.0.0 --port 4173
pnpm --filter @acds/worker run start
```

If you only need to confirm the workspace health after installation, run:

```bash
pnpm run verify:install
```

That command verifies internal `workspace:*` package resolution and then runs the workspace typecheck.

### Standalone API Bootstrap

The API layer now validates its dependency-injection container at startup and fails fast if required services are missing. This prevents the previous failure mode where the process started successfully but most routes crashed on first use.

If you are running `apps/api` standalone, the default `src/main.ts` bootstrap now builds that `diContainer` for you from the seeded profile config, the Postgres-backed repositories, and env-provided cloud API keys. The route layer no longer falls back to placeholder `{}` dependencies.

Use the package directly when you want to start only the API:

```bash
pnpm --filter @acds/api run build
pnpm --filter @acds/api run start
```

The API package and its runtime dependencies now declare ESM package metadata as well, so the compiled standalone startup path runs without Node's module reparsing warnings.

### Register a Provider

After starting, open the admin UI and register at least one provider.

MVP-supported providers:

- **Ollama** (local): Default endpoint `http://localhost:11434`, no API key needed
- **LM Studio** (local): Default endpoint `http://localhost:1234`, no API key needed

Experimental providers:

- **Gemini** (cloud): Requires a Google AI API key
- **OpenAI** (cloud): Requires an OpenAI API key
- **Apple Intelligence** (bridge-backed): macOS-specific and not part of the baseline MVP operator path

See [Provider Setup](docs/operator/PROVIDER_SETUP.md) for detailed instructions.

### Admin UI Posture

The admin UI is a standalone Vite application with distinct operator and development modes.

```bash
# Operator-facing MVP mode: built assets served through Vite preview
pnpm --filter @acds/admin-web run preview -- --host 0.0.0.0 --port 4173

# Developer-only live-reload mode against the API proxy target
pnpm --filter @acds/admin-web run dev

# Demo/non-release mock mode with seeded in-browser data
pnpm --filter @acds/admin-web run dev:mock
```

`preview` is the canonical operator-facing path for MVP. `dev` is a developer workflow, and `dev:mock` is a non-release/demo-only workflow when Postgres or the API is unavailable.

## Install Troubleshooting

If install or workspace linking fails:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules tests/node_modules infra/db/node_modules
pnpm install
pnpm run verify:install
```

To confirm `workspace:*` linking succeeded, `pnpm run verify:install` should print resolved internal package manifests for `@acds/api`, `@acds/worker`, `@acds/grits-worker`, and `@acds/tests` before running the workspace typecheck.

## Key Concepts

- **Model Profiles**: Abstract cognitive capabilities (e.g., `local_fast_advisory`, `cloud_frontier_reasoning`)
- **Tactic Profiles**: Execution strategies (e.g., `single_pass_fast`, `draft_then_critique`)
- **Execution Families**: Identity for adaptive learning (`application.process.step.posture.grade`)
- **Policy Layers**: Global -> Application -> Process -> Instance policy cascade
- **Adaptive Optimization**: Policy-bounded learning from execution outcomes

## Recent Hardening

- **Provider-native execution**: dispatch execution now resolves a model profile to its provider `modelId` before calling the adapter.
- **Real fallback behavior**: the main run path now walks the computed fallback chain instead of failing immediately on the primary provider error.
- **Safer provider registration**: cloud provider URLs must use `https://` and cannot target loopback, link-local, or private-network hosts.
- **Recursive secret redaction**: redaction now traverses arrays and common key variants such as camelCase and snake_case credential fields.
- **Stateful adaptive controls**: low-risk auto-apply and rollback now mutate optimizer state rather than only writing audit-style records.

## Documentation

- **Architecture:** [Overview](docs/architecture/ARCHITECTURE_OVERVIEW.md) | [Component Boundaries](docs/architecture/COMPONENT_BOUNDARIES.md) | [Routing Model](docs/architecture/ROUTING_MODEL.md) | [Execution Flow](docs/architecture/EXECUTION_FLOW.md)
- **Traceability:** [Runtime Traceability](docs/architecture/RUNTIME_TRACEABILITY.md)
- **Security:** [Secret Storage](docs/security/SECRET_STORAGE.md) | [Audit Model](docs/security/AUDIT_MODEL.md)
- **Operator:** [Admin Guide](docs/operator/ADMIN_GUIDE.md) | [Admin UI Development](docs/operator/ADMIN_UI_DEVELOPMENT.md) | [Provider Setup](docs/operator/PROVIDER_SETUP.md) | [Policy Configuration](docs/operator/POLICY_CONFIGURATION.md) | [Troubleshooting](docs/operator/TROUBLESHOOTING.md)
- **MVP:** [Boundary](docs/MVP_BOUNDARY.md) | [Operator Guide](docs/operator/MVP_OPERATOR_GUIDE.md) | [Environment Matrix](docs/operator/ENVIRONMENT_MATRIX.md)
- **GRITS:** [Architecture](docs/grits/GRITS_ARCHITECTURE.md) | [Operations Runbook](docs/grits/OPERATIONS_RUNBOOK.md) | [Schema Mapping](docs/grits/SCHEMA_MAPPING.md)
