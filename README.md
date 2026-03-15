# Adaptive Cognitive Dispatch System

A **Governed Adaptive Cognitive Dispatch System** that enables applications to safely, efficiently, and intelligently utilize both local and cloud-based AI services.

## Purpose

Applications like **Thingstead** (governance) and **Process Swarm** (content generation) declare cognitive intent — the system determines which model, tactic, and provider should handle each request, with full auditability and adaptive optimization over time.

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

## Top-Level Structure

```
adaptive-cognitive-dispatch/
├── apps/
│   ├── api/              # HTTP API server
│   ├── admin-web/        # Admin management UI
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
├── docs/                 # Architecture and operator docs
└── tests/                # Integration and scenario tests
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm --filter ./infra/db run migrate

# Start development
pnpm dev
```

## Key Concepts

- **Model Profiles**: Abstract cognitive capabilities (e.g., `local_fast_advisory`, `cloud_frontier_reasoning`)
- **Tactic Profiles**: Execution strategies (e.g., `single_pass_fast`, `draft_then_critique`)
- **Execution Families**: Identity for adaptive learning (`application.process.step.posture.grade`)
- **Policy Layers**: Global → Application → Process → Instance policy cascade
- **Adaptive Optimization**: Policy-bounded learning from execution outcomes
