# System Overview

## Purpose
The Adaptive Cognitive Dispatch System is a Governed Adaptive Cognitive Dispatch System that enables applications to safely, efficiently, and intelligently utilize both local and cloud-based AI services.

The system provides:
1. Centralized provider management
2. Policy-based cognitive routing
3. Process-aware execution control
4. Adaptive optimization inspired by AdaEvolve-style improvement loops
5. Secure secret handling
6. Full auditability for governance systems such as Thingstead

The design explicitly separates:
- Provider access
- Cognitive routing policy
- Process-level execution logic
- Adaptive optimization
- Application behavior

This separation prevents vendor lock-in, avoids duplicated credential handling, and enables controlled optimization of AI usage over time.

## How It Works
The system acts as a central cognitive infrastructure service between applications and AI providers. Applications do not call AI providers directly. Instead, they declare cognitive intent, and the system determines:
- Which model profile should be used
- Which tactic should be applied
- Which provider should handle the request
- Whether escalation is necessary
- How the decision should be logged for governance

## Architectural Layers

### Layer 1 — Application Layer
Applications define processes and steps that require cognitive services.

**Thingstead:** governance classification, policy interpretation, control review, decision recommendation

**Process Swarm:** context document synthesis, research analysis, artifact generation, structured extraction

Applications declare intent but never select providers or manage credentials.

### Layer 2 — Process Orchestration Layer
Processes represent structured workflows. Each process contains steps, and each step may invoke cognitive services.

Example: thingstead.control_review
- step 1: evidence classification
- step 2: provisional recommendation
- step 3: final decision reasoning

Each step includes metadata: task_type, load, decision_posture, cognitive_grade, privacy_constraints, structure_requirements

### Layer 3 — Cognitive Dispatch Layer
Determines how a cognitive request should be executed: policy resolution, eligibility determination, profile selection, tactic selection, escalation logic, adaptive optimization, audit rationale generation.

### Layer 4 — Adaptive Optimization Layer
Introduces learning behavior inspired by AdaEvolve-style optimization. Tracks output acceptance rates, human correction burden, schema compliance, latency, cost efficiency, escalation frequency, artifact usefulness, hallucination risk indicators. All adaptations remain policy bounded.

### Layer 5 — Provider Broker Layer
Manages provider connectivity, authentication, credential storage, health checks, request proxying, secret isolation.

**Local Providers:** Ollama, LM Studio, future vLLM or similar runtimes
**Cloud Providers:** Gemini, OpenAI, future providers such as Anthropic or Azure OpenAI
