# Inference Triage System (ITS)

## Definition

ITS is a deterministic, policy-governed routing system that maps task characteristics to the minimum sufficient inference capability across local and external compute domains, while preserving auditability, sovereignty, and execution constraints.

ITS operates as an intermediary between:
- Work definition layers (Thingstead, Process Swarm)
- Inference execution layers (ACDS providers, local models, Apple Intelligence, external APIs)

## Core Invariant

> Inference routing must be derived from task characteristics and constraints, not from explicit model selection.

## System Placement

ITS spans multiple layers of the sovereign stack:

1. **Compute & Communication Layer** — Controls where inference executes (local vs external)
2. **Application Layer** — Integrates with Process Swarm workflows as the routing engine for execution steps
3. **Governance Layer** — Enforces policy constraints and produces auditable decision records

## Triage Pipeline

Each task is evaluated through a structured pipeline:

```
1. Validate Intent Envelope (schema compliance)
2. Load Policy Set (Thingstead governance rules)
3. Apply Policy Constraints (trust zones, privacy, execution restrictions)
4. Retrieve Provider Registry (available, capability-matched providers)
5. Capability Filtering (task class, quality ceiling, trust zone, modality)
6. Constraint Filtering (latency, context size, execution constraints)
7. Ranking (lowest sufficient quality → lowest latency → lowest cost → fallback rank)
8. Selection (first provider in sorted list, or failure state)
9. Fallback Chain Construction (remaining sorted providers)
10. Emit Triage Record (full decision written to ledger)
```

## Core Data Structures

### Intent Envelope (Input)

```typescript
interface IntentEnvelope {
  intentId: string;
  taskClass: TaskType;
  modality: Modality;           // text_to_text | text_to_speech | speech_to_text | image | multimodal
  sensitivity: Sensitivity;     // public | internal | restricted | confidential | regulated
  qualityTier: QualityTier;    // low | medium | high | critical
  latencyTargetMs: number | null;
  costSensitivity: CostSensitivity;
  executionConstraints: {
    localOnly: boolean;
    externalAllowed: boolean;
    offlineRequired: boolean;
  };
  contextSizeEstimate: ContextSize; // small | medium | large
  requiresSchemaValidation: boolean;
  origin: 'process_swarm' | 'manual' | 'api';
  timestamp: string;
}
```

### Triage Decision (Output)

```typescript
interface TriageDecision {
  triageId: string;
  intentId: string;
  classification: {
    taskClass: string;
    modality: string;
    sensitivity: string;
    qualityTier: string;
  };
  policyEvaluation: {
    appliedRules: string[];
    allowedTrustZones: TrustZone[];
    externalPermitted: boolean;
  };
  candidateProviders: Array<{
    providerId: string;
    eligible: boolean;
    rejectionReason: string | null;
  }>;
  selectedProvider: {
    providerId: string;
    selectionReason: string;
  } | null;
  fallbackChain: string[];
  timestamp: string;
}
```

## Key Concepts

### Sensitivity Classes

Data is classified into trust tiers that determine allowable execution zones:

| Sensitivity | Allowed Trust Zones |
|---|---|
| public | local, device, external |
| internal | local, device, external |
| restricted | local, device |
| confidential | local |
| regulated | local |

### Quality Tiers

| Tier | Description |
|---|---|
| low | Approximate, fast |
| medium | Reliable |
| high | Publication-grade |
| critical | Decision-support |

### Minimum Sufficient Intelligence

From eligible candidates, ITS selects the lowest-cost, lowest-latency provider that satisfies all constraints. This enforces efficiency without sacrificing correctness.

## Relationship to ACDS

- **ITS determines what is needed** — policy-bound decision engine
- **ACDS determines how to execute it** — capability-aware provider broker

ITS does not execute inference directly. It does not mutate task content. It does not perform deep semantic analysis.

## Failure Modes

| Error | Description |
|---|---|
| `NO_ELIGIBLE_PROVIDER` | All providers rejected by policy or capability constraints |
| `POLICY_CONFLICT` | Policies produce contradictory constraints |
| `INVALID_INTENT_ENVELOPE` | Missing required fields in input |

## Determinism Requirements

- Explicit comparisons only
- No probabilistic ranking
- No learned heuristics
- Identical input → identical output

## Implementation Scope

Rule-based triage only. Static provider registry. No adaptive learning. No semantic classification. No dynamic provider capability inference.

## ACDS Integration

ITS is implemented as `packages/routing-engine/src/triage/`. It wraps the existing routing pipeline (`PolicyMergeResolver` → `EligibleProfilesService` → `DeterministicProfileSelector` → `FallbackChainBuilder`) with ITS-specific input/output contracts.

API endpoints:
- `POST /triage` — Pure routing decision (no execution)
- `POST /triage/run` — Routing + execution in one step
