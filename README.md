# Adaptive Cognitive Dispatch System

A **Governed Adaptive Cognitive Dispatch System** that enables applications to safely, efficiently, and intelligently utilize both local and cloud-based AI services.

## What It Does

ACDS sits between your applications and AI providers. Instead of hardcoding which model to call, your application declares a **cognitive intent** -- what kind of thinking is needed -- and ACDS determines the best model, execution tactic, and provider to handle the request. Every decision is policy-governed, auditable, and resilient through automatic fallback.

## Why It Exists

Applications like **Thingstead** (governance) and **Process Swarm** (content generation) need AI capabilities but should not be tightly coupled to specific vendors or models. ACDS provides:

- **Vendor independence.** Applications describe intent, not providers. Switch from Ollama to OpenAI without changing application code.
- **Policy governance.** A three-level policy cascade (global, application, process) controls which vendors, models, and tactics are allowed for each request.
- **Automatic fallback.** If the primary provider fails, execution continues through a pre-computed fallback chain.
- **Full auditability.** Every routing decision and execution is recorded with a human-readable rationale explaining why each choice was made.
- **Adaptive optimization.** The system learns from execution outcomes to improve routing over time, within policy bounds.

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
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration (database URL, master key path, etc.)

# Run database migrations
pnpm --filter ./infra/db run migrate

# Start development (API server, admin UI, and worker)
pnpm dev
```

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

After starting, open the admin UI and register at least one provider:

- **Ollama** (local): Default endpoint `http://localhost:11434`, no API key needed
- **LM Studio** (local): Default endpoint `http://localhost:1234`, no API key needed
- **Gemini** (cloud): Requires a Google AI API key
- **OpenAI** (cloud): Requires an OpenAI API key

See [Provider Setup](docs/operator/PROVIDER_SETUP.md) for detailed instructions.

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
- **Security:** [Secret Storage](docs/security/SECRET_STORAGE.md) | [Audit Model](docs/security/AUDIT_MODEL.md)
- **Operator:** [Admin Guide](docs/operator/ADMIN_GUIDE.md) | [Provider Setup](docs/operator/PROVIDER_SETUP.md) | [Policy Configuration](docs/operator/POLICY_CONFIGURATION.md) | [Troubleshooting](docs/operator/TROUBLESHOOTING.md)
