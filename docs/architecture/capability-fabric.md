# ACDS Application-Agnostic Cognitive Service Fabric

## Overview

ACDS is a provider-agnostic, application-agnostic cognitive routing and execution fabric. Applications request **capabilities** (e.g., `text.summarize`). ACDS determines **which provider** executes the request based on policy, cost, latency, reliability, and locality constraints.

## Seven Layers

| Layer | Component | Purpose |
|-------|-----------|---------|
| 1 | Capability Contracts | Portable capability IDs with versioned input/output schemas |
| 2 | Provider Registry | Providers declare capabilities with cost/latency/reliability metadata |
| 3 | Policy Engine | Sensitivity, cost ceilings, latency ceilings, local-first enforcement |
| 4 | Routing Engine | Multi-objective scoring, provider selection, fallback chain construction |
| 5 | Execution Layer | Provider invocation, output normalization, error handling |
| 6 | Audit/Lineage | Execution logs, decision traces, policy audit trail |
| 7 | API Interface | `request(capability, input, constraints) → response` |

## Capability Taxonomy

| Category | Capabilities |
|----------|-------------|
| Text | `text.generate`, `text.summarize`, `text.classify`, `text.embed`, `text.extract`, `text.rewrite`, `text.proofread` |
| Speech | `speech.transcribe`, `speech.synthesize` |
| Image | `image.generate`, `image.describe`, `image.ocr` |
| Sound | `sound.classify` |
| Translation | `translation.translate` |
| Control | `agent.control.decide`, `router.score` |
| Governance | `policy.evaluate`, `risk.assess` |

## Scoring Algorithm

Each eligible provider is scored:

```
score = (0.3 × costScore) + (0.3 × latencyScore) + (0.3 × reliabilityScore) + (0.1 × localityBonus)
```

- `costScore` = 1 - (provider_cost / max_cost)
- `latencyScore` = 1 - (provider_p95 / max_latency)
- `reliabilityScore` = provider_reliability (0-1)
- `localityBonus` = 1.0 if local, 0.0 if remote

## Key Properties

- **Application agnosticism** — any system integrates via capability contracts
- **Deterministic invocation** — all decisions are explainable and reproducible
- **Local-first sovereignty** — prioritizes local → controlled → external providers
- **Provider substitutability** — replace providers without code changes
- **Fine-grained control** — per-request, per-process, per-task selection
