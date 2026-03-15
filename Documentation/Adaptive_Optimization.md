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
