# ACDS Integration Use-Case Suite for Process Swarm

> **Status: COMPLETE** — All 25 use cases implemented. 102 tests across 6 phases.
> 100% statement coverage on evaluation module (729/729 statements).

## Purpose

This suite defines the behavioral use-cases Process Swarm must satisfy once ACDS is wired in as a governed inference provider using Apple Intelligence for local inference.

The suite is written to support Test-Driven Development. Each use-case is a contract implemented as:

1. Failing tests first
2. Minimum implementation to satisfy the test
3. Refactor only after green
4. Preserve ledger visibility and governed routing at every step

## Global Testing Posture

All use-cases assume the following:

- Provider routing is explicit, not heuristic-only
- Every inference step is ledgered
- Every artifact is validated before acceptance
- Fallback behavior is explicit and testable
- Source-grounded outputs are preferred over fluent unsupported outputs
- Replayability matters more than stylistic polish

---

## I. Provider Routing Use-Cases

### UC-ACDS-001. Route a Qualified Synthesis Task to ACDS

**Objective:** Process Swarm routes a synthesis-class task to ACDS when routing policy says ACDS is the preferred local provider.

**Preconditions:**
- ACDS provider is registered
- Routing policy exists for synthesis tasks
- Test source set is available
- Ledger is operational

**Input:**
- Task type: `source_synthesis`
- Source set: multiple related articles or documents
- Policy: `prefer_acds_for_synthesis = true`

**Expected Flow:**
1. Process Swarm receives the task
2. Routing engine evaluates task metadata
3. Routing engine selects ACDS
4. Prompt package is handed to ACDS adapter
5. ACDS returns output
6. Output is validated
7. Artifact and provider decision are written to ledger

**Assertions:**
- Selected provider equals `acds`
- No fallback provider used
- Ledger contains provider selection reason
- Ledger contains task-to-provider linkage
- Artifact status equals `accepted` only after validation passes

**Failure Condition:** If the task is sent to any other provider without an explicit override, the test fails.

**Implementation:** `tests/test_acds_evaluation/test_phase1_routing_ledger.py::TestProviderRouting`

---

### UC-ACDS-002. Do Not Route a Non-Qualified Task to ACDS

**Objective:** Process Swarm does not use ACDS for task classes where policy says another provider is preferred.

**Preconditions:**
- ACDS is registered
- Another provider is registered
- Routing policy excludes ACDS for lightweight or trivial tasks

**Input:**
- Task type: `lightweight_classification`
- Policy: `prefer_fast_provider_for_classification = true`

**Expected Flow:**
1. Task enters routing layer
2. Routing policy evaluates the task
3. Routing engine selects the preferred non-ACDS provider
4. Task completes normally
5. Decision is ledgered

**Assertions:**
- Selected provider is not `acds`
- Ledger records why ACDS was not selected
- No hidden ACDS call occurs

**Failure Condition:** If ACDS is called anyway, the test fails.

**Implementation:** `tests/test_acds_evaluation/test_phase1_routing_ledger.py::TestProviderRouting`

---

### UC-ACDS-003. Log Provider Choice Deterministically

**Objective:** Every ACDS invocation is logged with enough detail to explain and replay the run.

**Preconditions:**
- Ledger supports provider event entries
- ACDS adapter exposes model/provider metadata

**Input:** Any task that routes to ACDS

**Expected Flow:**
1. ACDS is selected
2. Provider call metadata is captured
3. Ledger entry is written before or during task completion

**Assertions:** Ledger entry includes:
- Provider name
- Task id
- Workflow id
- Invocation timestamp
- Routing reason
- Fallback state
- Validation result linkage

**Failure Condition:** If the output exists but the provider event is missing or incomplete, the test fails.

**Implementation:** `tests/test_acds_evaluation/test_phase1_routing_ledger.py::TestProviderEventLedger`

---

## II. Artifact Quality Use-Cases

### UC-ACDS-004. Produce a Better Opening Snapshot for an Intelligence Brief

**Objective:** ACDS generates an opening snapshot that accurately reflects the dominant themes in the source set.

**Assertions:**
- Opening snapshot exists
- Snapshot references dominant themes from source set
- No unsupported themes appear
- Score for relevance meets threshold
- Score exceeds baseline provider score by target margin if baseline comparison mode is enabled

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestQualityScoring`

---

### UC-ACDS-005. Rank Top Developments Correctly

**Objective:** ACDS prioritizes the most important developments from a source set.

**Assertions:**
- Top 3 section exists
- At least 2 of 3 expected high-signal items are present
- No trivial distractor appears in top positions
- Rationale for ranking can be traced to source content

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestAccuracyScoring`

---

### UC-ACDS-006. Maintain Section Coherence Across the Whole Brief

**Objective:** The generated brief remains internally coherent from opening snapshot through body sections.

**Assertions:**
- Opening claims are supported later in the brief
- Top developments are elaborated downstream
- No contradictory section claims exist
- No major topic drift occurs

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestCoherenceScoring`

---

### UC-ACDS-007. Preserve Facts During Constrained Rewrite

**Objective:** ACDS rewrites material under stylistic constraints without losing critical facts.

**Assertions:**
- All critical facts remain present
- No invented facts appear
- Requested style constraints are met
- Structure constraints are met

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestConstraintAdherenceScoring`

---

## III. Source Fidelity Use-Cases

### UC-ACDS-008. Ground Claims in the Provided Source Set

**Objective:** ACDS produces claims that are supportable by the provided sources.

**Assertions:**
- All critical claims map to source evidence
- Unsupported claims count is zero in critical sections
- Named entities match sources
- No source transposition occurs

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestSourceFidelity`

---

### UC-ACDS-009. Detect Insufficient Source Support Instead of Hallucinating

**Objective:** When sources are too weak, ACDS or the surrounding validation logic should produce a bounded result, not fabricated certainty.

**Assertions:**
- System acknowledges limited evidence
- Unsupported strong conclusions are absent
- Artifact is either downgraded, flagged, or rejected
- Ledger records insufficiency outcome

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestSourceFidelity`

---

### UC-ACDS-010. Handle Conflicting Sources Without False Certainty

**Objective:** ACDS identifies material disagreement in source material rather than collapsing conflict into a single unqualified narrative.

**Assertions:**
- Conflict is explicitly noted
- Claims are qualified appropriately
- System does not present one side as settled fact without support
- Artifact remains structurally valid

**Implementation:** `tests/test_acds_evaluation/test_phase4_quality_scoring.py::TestSourceFidelity`

---

## IV. Validation Gate Use-Cases

### UC-ACDS-011. Reject Malformed ACDS Output at the Validation Gate

**Objective:** Malformed output is not silently accepted into the artifact pipeline.

**Assertions:**
- Artifact status is not `accepted`
- Validation failure reason is recorded
- No downstream publication step occurs

**Implementation:** `tests/test_acds_evaluation/test_phase2_validation_gates.py::TestMalformedOutputRejection`

---

### UC-ACDS-012. Reject Unsupported Ranked Output

**Objective:** A ranked artifact that cannot support its rankings from the source material is not accepted as valid.

**Assertions:**
- Unsupported ranking triggers validation issue
- Ledger records ranking validation reason
- Output is not marked ready for publication

**Implementation:** `tests/test_acds_evaluation/test_phase2_validation_gates.py::TestRankedOutputRejection`

---

### UC-ACDS-013. Enforce Constraint Compliance Before Accepting Artifact

**Objective:** ACDS output must satisfy structural and formatting constraints before acceptance.

**Assertions:**
- Constraint violations are visible
- Acceptance blocked when violations exceed tolerance
- Validator output is ledgered

**Implementation:** `tests/test_acds_evaluation/test_phase2_validation_gates.py::TestConstraintCompliance`

---

## V. Runtime Reliability Use-Cases

### UC-ACDS-014. Handle ACDS Timeout with Controlled Failure

**Objective:** An ACDS timeout results in an explicit controlled failure, not a false-success run.

**Assertions:**
- No success artifact is emitted
- Timeout reason is recorded
- Run status reflects reality
- No orphaned partial state remains

**Implementation:** `tests/test_acds_evaluation/test_phase3_failure_handling.py::TestProviderTimeout`

---

### UC-ACDS-015. Execute Explicit Fallback After ACDS Failure

**Objective:** When policy allows fallback, Process Swarm moves from ACDS to a fallback provider in a controlled and visible manner.

**Assertions:**
- Fallback only occurs when policy permits
- Both provider events are visible
- Final artifact identifies fallback involvement
- Validation still runs on fallback output

**Implementation:** `tests/test_acds_evaluation/test_phase3_failure_handling.py::TestProviderFallback`

---

### UC-ACDS-016. Survive Concurrent ACDS-Backed Runs Without Corrupting State

**Objective:** Multiple ACDS-backed jobs can run or queue safely without ledger corruption or orphaned artifacts.

**Assertions:**
- No shared-state corruption
- No duplicate ledger entries
- No artifact cross-linking
- Final run states are accurate

**Implementation:** `tests/test_acds_evaluation/test_phase3_failure_handling.py::TestConcurrentExecution`

---

## VI. Comparative Quality Use-Cases

### UC-ACDS-017. Outperform Baseline Local Provider on Synthesis Quality

**Objective:** ACDS demonstrates a measurable quality improvement over the previous local provider for synthesis tasks.

**Assertions:**
- ACDS score exceeds baseline on defined quality dimensions
- Improvement meets threshold
- Comparison is reproducible across the corpus

**Implementation:** `tests/test_acds_evaluation/test_phase5_comparative.py::TestComparativeFramework`

---

### UC-ACDS-018. Outperform Baseline on Constrained Rewrite Fidelity

**Objective:** ACDS preserves facts and constraints better than the previous provider during rewrite tasks.

**Assertions:**
- ACDS preserves more required facts
- ACDS violates fewer structural constraints
- ACDS produces fewer unsupported embellishments

**Implementation:** `tests/test_acds_evaluation/test_phase5_comparative.py::TestACDSOutperformance`

---

### UC-ACDS-019. Ignore Distractor Sources Better Than Baseline

**Objective:** ACDS shows stronger relevance filtering when a flashy but irrelevant source is injected.

**Assertions:**
- Distractor source is omitted or explicitly deprioritized
- Core themes remain dominant
- Result outperforms baseline provider on distractor resistance

**Implementation:** `tests/test_acds_evaluation/test_phase5_comparative.py::TestBaselineAdequacy`

---

## VII. Ledger and Replay Use-Cases

### UC-ACDS-020. Preserve Replayable Run Context for an ACDS Invocation

**Objective:** A completed ACDS-backed run can be replayed with enough fidelity to compare outcomes meaningfully.

**Assertions:**
- Replay package includes source set reference
- Replay package includes routing decision
- Replay package includes validation rules used
- Output comparison is possible
- Differences are explainable and ledgered

**Implementation:** `tests/test_acds_evaluation/test_phase6_replay_e2e.py::TestRunReplay`

---

### UC-ACDS-021. Record Validation Outcomes Alongside Provider Events

**Objective:** The ledger records not only that ACDS was used, but whether its output passed or failed post-generation validation.

**Assertions:**
- Each provider event can be linked to a validation outcome
- Passing and failing outcomes are distinguishable
- No artifact appears "complete" without visible validation status

**Implementation:** `tests/test_acds_evaluation/test_phase2_validation_gates.py::TestValidationLedgerLinkage`

---

## VIII. End-to-End Demonstration Use-Cases

### UC-ACDS-022. Produce a Valid Nik's Context Document Through ACDS

**Objective:** Process Swarm produces a valid weekly intelligence briefing using ACDS as the inference layer.

**Assertions:**
- Artifact exists
- Artifact passes structural validation
- Artifact passes source-fidelity threshold
- Provider selection is visible
- Final run state is success only if validation passed

**Implementation:** `tests/test_acds_evaluation/test_phase6_replay_e2e.py::TestEndToEndWorkflow`

---

### UC-ACDS-023. Produce a Two-Artifact Workflow with ACDS Feeding Downstream Stages

**Objective:** An ACDS-generated written artifact can serve as the upstream input for downstream artifact generation without losing lineage.

**Assertions:**
- Written artifact created first
- Downstream stage only consumes validated text
- Lineage links text artifact to audio artifact
- Run ledger shows multi-artifact chain clearly

**Implementation:** `tests/test_acds_evaluation/test_phase6_replay_e2e.py::TestEndToEndWorkflow`

---

## IX. Negative and Adversarial Use-Cases

### UC-ACDS-024. Reject Fluent but Unsupported Output

**Objective:** The system resists accepting highly polished but unsupported ACDS output.

**Assertions:**
- Unsupported content does not pass on style alone
- Rejection reason identifies support gap
- Ledger reflects validation failure

**Implementation:** `tests/test_acds_evaluation/test_phase6_replay_e2e.py::TestRunAggregation` (via validation gate checks)

---

### UC-ACDS-025. Prevent Silent Partial Success After Mid-Run ACDS Failure

**Objective:** The workflow does not claim success when ACDS failed after partial progress.

**Assertions:**
- No false final success state
- Partial state is visible and bounded
- Operator can see where failure happened

**Implementation:** `tests/test_acds_evaluation/test_phase3_failure_handling.py::TestSilentPartialSuccess`

---

## X. Implementation Status

### Test Coverage Summary

| Phase | Use Cases | Tests | Status |
|-------|-----------|-------|--------|
| 1. Routing & Ledger | UC-001, 002, 003 | 14 | PASS |
| 2. Validation Gates | UC-011, 012, 013, 021 | 22 | PASS |
| 3. Runtime Failure | UC-014, 015, 025, 016 | 17 | PASS |
| 4. Quality & Fidelity | UC-004–010 | 20 | PASS |
| 5. Comparative | UC-017, 018, 019 | 12 | PASS |
| 6. E2E & Replay | UC-020, 022, 023, 024 | 17 | PASS |
| **Total** | **25 use cases** | **102 tests** | **ALL PASS** |

### Implementation Modules

| Module | Purpose |
|--------|---------|
| `process_swarm/evaluation/__init__.py` | Package init |
| `process_swarm/evaluation/routing.py` | ProviderPolicy, ProviderSelector, RoutingDecision |
| `process_swarm/evaluation/ledger.py` | ProviderEventLedger (append-only event store) |
| `process_swarm/evaluation/validation.py` | ProviderOutputValidator, ConstraintValidator, AcceptanceGate |
| `process_swarm/evaluation/runtime.py` | ProviderRuntime, CompletenessChecker, FallbackOrchestrator |
| `process_swarm/evaluation/scoring.py` | QualityScorer, ScoreResult (ordinal 1–5 dimensions) |
| `process_swarm/evaluation/comparative.py` | ComparativeEvaluator, ComparisonReport |
| `process_swarm/evaluation/runner.py` | EvaluationRunner, EvaluationRun, aggregate_runs |

### Required Test Harness Components

| Component | Status |
|-----------|--------|
| Gold-standard scoring rubric | Implemented (QualityScorer) |
| Malformed-output fixtures | Implemented (test fixtures) |
| ACDS timeout simulation | Implemented (ProviderRuntime flags) |
| ACDS error simulation | Implemented (ProviderRuntime flags) |
| Fallback provider | Implemented (FallbackOrchestrator) |
| Structure validator | Implemented (ProviderOutputValidator) |
| Constraint validator | Implemented (ConstraintValidator) |
| Source-fidelity checker | Implemented (QualityScorer.source_fidelity) |
| Ranking validator | Implemented (QualityScorer.ranking_quality) |
| Provider comparison report | Implemented (ComparisonReport) |
| Replayability | Implemented (EvaluationRun.to_dict / replay) |
| Quality scorecard | Implemented (ScoreResult.to_dict) |

---

## XI. Definition of Done

ACDS integration is not considered complete until the following are true:

1. ACDS can be selected intentionally by routing policy
2. Every ACDS invocation is ledger-visible
3. Validation gates can reject bad ACDS output
4. Failure and fallback paths are explicit and test-covered
5. ACDS materially improves at least one important task class over the current baseline
6. End-to-end multi-artifact workflows preserve lineage
7. Fluent but unsupported output cannot pass merely because it reads well

This is the correct standard for governed local inference.
