# ACDS + Process Swarm Integration Model

**Classification:** Distributed Cognitive Orchestration Architecture
**Version:** 0.1 (MVP Integration)

## Core Principle

Orchestration defines intent flow. ACDS defines cognitive execution.

- **Process Swarm** resolves *what* work is executed and in *what order*
- **ACDS** resolves *how* cognition is executed

Together they produce: deterministic orchestration, adaptive inference routing, multi-artifact generation, governed execution, auditable lineage.

## Integration Boundary

Process Swarm never calls providers directly. Process Swarm calls ACDS.

```
Process Swarm Node -> ACDS.request(capability, input, constraints)
```

## System Roles

### Process Swarm (Orchestration Layer)
- Define workflows (graphs)
- Manage task sequencing and dependencies
- Generate and track artifacts
- Maintain execution state
- Model-agnostic

### ACDS (Cognitive Fabric)
- Resolve capability requests
- Select providers and enforce policy
- Execute inference and normalize outputs
- Record decision rationale
- Workflow-agnostic

## Node Types
1. **Cognitive Node** - Calls ACDS, produces content/decisions
2. **Control Node** - Lightweight SLM via ACDS for routing
3. **Tool Node** - Non-LLM logic execution
4. **Policy Node** - Calls policy.evaluate capability
5. **Aggregation Node** - Combines outputs

## Governance
- All policies enforced in ACDS (not Process Swarm)
- ACDS logs provider decisions and routing rationale
- Process Swarm logs workflow execution and artifact lineage
- GRITS evaluates routing correctness, policy adherence, drift, and failure recovery
