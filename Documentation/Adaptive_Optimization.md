# Adaptive Optimization System

Inspired by AdaEvolve-style hierarchical optimization, the system adapts at three levels.

## Local Adaptation
Within a single process-step family, the system evaluates competing model profiles and tactics. If a profile consistently produces better results, it becomes preferred. If performance degrades, exploration increases.

## Global Adaptation
The system shifts cognitive resources across workflows. Example: Process Swarm synthesis may justify more frontier model budget; Thingstead classification may prefer local models. Budget allocation adapts based on observed value.

## Meta Guidance
When improvement stalls, the system generates new strategies: split task into extraction + reasoning, insert critique step, escalate model profile, change reasoning scaffold, enable multi-stage reasoning pipeline. All changes are recorded as adaptation events.

## Execution Family Identity
Adaptive learning operates per execution family defined as: application, process, step, decision_posture, cognitive_grade.

Example family: process_swarm.context_document.synthesis.final

Each family maintains its own optimization history.

## Improvement Signal
Each execution family tracks:
- acceptance_rate
- schema_compliance
- human_revision_rate
- latency
- cost_per_run
- retry_frequency
- hallucination_indicators
- confidence_alignment
- artifact_quality_score

These metrics produce a weighted improvement score used for adaptive routing.

## Candidate Identification
Each candidate is identified by a composite key: `${modelProfileId}:${tacticProfileId}:${providerId}`. The `buildCandidateId()` and `parseCandidateId()` functions in `@acds/adaptive-optimizer` manage this format with validation. All consumers use `parseCandidateId` rather than raw string splitting.

## Plateau Detection
The `PlateauDetector` analyzes five indicators:
- **Flat quality**: quality score variance below threshold
- **Rising cost**: cost trending upward without quality gains
- **Rising correction burden**: human correction rate increasing
- **Repeated fallbacks**: fallback rate above threshold
- **Persistent underperformance**: average score below acceptable minimum

Severity classification: none (0 indicators), mild (1-2), moderate (3), severe (4-5). Each severity level produces a different recommendation.

## Adaptive Routing Integration
The `AdaptiveDispatchResolver` integrates adaptive selection into the routing pipeline. When adaptive mode is active and optimizer state exists for the family, it builds a candidate portfolio and invokes the `AdaptiveSelectionService`. When adaptive selection returns no result (e.g., no optimizer state, empty portfolio), it logs the fallback reason and delegates to the deterministic pipeline transparently.

## Escalation and Profile Selection
The `DeterministicProfileSelector` respects escalation policy: when `forceEscalation: true`, it prefers cloud-capable profiles over local-only ones. This ensures that final/evidentiary postures can access frontier models when policy demands it, while advisory postures continue to prefer local models for cost efficiency.
