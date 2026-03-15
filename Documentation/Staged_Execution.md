# Staged Execution and Escalation

## Confidence-Driven Escalation
Confidence signals determine whether escalation is required:
- if confidence < threshold → escalate_profile()
- if consequence == high → escalate_profile()
- if decision_posture == final → escalate_profile()

This allows staged cognition pipelines.

## Staged Cognitive Execution
Instead of always using the strongest model first, tasks may proceed through stages.

Example decision workflow:
- Stage 1 — Local triage
- Stage 2 — Local reasoning
- Stage 3 — Frontier reasoning
- Stage 4 — Human review

Escalation occurs only when necessary.
