# ACDS Red-Team Use-Case Suite for Process Swarm

> **Status: COMPLETE** — All 29 adversarial use cases implemented. 77 tests across 7 phases.
> Plus 19 coverage gap tests. 100% statement coverage on all integrity components.

## Purpose

This suite defines adversarial and failure-oriented use-cases for testing the ACDS integration inside Process Swarm.

These use-cases validate that ACDS cannot:

- Silently bypass routing policy
- Evade validation
- Produce polished but unsupported artifacts that get accepted
- Collapse conflicts into false certainty
- Poison lineage or replayability
- Trigger fallback invisibly
- Create false success states
- Contaminate downstream artifacts
- Degrade under concurrency or prompt pressure in ways the system cannot detect

These are hostile-system tests, not normal functional tests.

---

## I. Routing Integrity Red-Team Use-Cases

### RT-ACDS-001. Attempt Silent Provider Substitution

**Objective:** Verify that ACDS cannot be swapped in or out without an explicit routing decision being recorded.

**Attack Pattern:** A malicious or buggy adapter returns output from another provider while claiming it is ACDS-originated.

**Expected Defense:**
- Provider metadata mismatch is detected
- Run is rejected or flagged
- Ledger records provider integrity violation

**Assertions:**
- Provider identity is independently validated where possible
- Lineage does not trust adapter self-report blindly
- Artifact is not accepted if provider provenance is ambiguous

---

### RT-ACDS-002. Attempt Policy Evasion Through Task Mislabeling

**Objective:** Verify that a task cannot gain access to ACDS by being mislabeled as a preferred task class.

**Attack Pattern:** A lightweight or excluded task is tagged as `source_synthesis` or other ACDS-preferred type.

**Expected Defense:**
- Routing checks more than surface labels
- Task metadata is cross-validated against shape or workflow origin
- Suspicious mismatch is flagged

**Assertions:**
- Mislabeled task does not automatically route to ACDS
- Routing reason reflects verified task class, not just claimed class

---

### RT-ACDS-003. Attempt Fallback Disguised as Primary Success

**Objective:** Verify that fallback output cannot be recorded as if it came directly from ACDS.

**Attack Pattern:** ACDS fails, fallback executes, but final artifact is marked as ACDS success.

**Expected Defense:**
- Provider chain is preserved
- Fallback provenance is mandatory in ledger and artifact metadata
- Final artifact cannot conceal fallback involvement

**Assertions:**
- Provider event history shows both failure and fallback
- Final success state identifies fallback path
- No collapsed provider lineage exists

---

## II. Output Trustworthiness Red-Team Use-Cases

### RT-ACDS-004. Submit Fluent but Unsupported Output

**Objective:** Verify that highly polished unsupported output is rejected.

**Attack Pattern:** Mock ACDS returns text with strong structure, tone, and coherence but with claims not grounded in source material.

**Expected Defense:**
- Source-fidelity validation catches unsupported claims
- Stylistic strength does not influence acceptance
- Artifact fails validation

---

### RT-ACDS-005. Inject Plausible Fabricated Named Entities

**Objective:** Verify that invented people, organizations, systems, or programs are caught.

**Attack Pattern:** ACDS output includes fabricated proper nouns that sound plausible in the context of the source set.

---

### RT-ACDS-006. Inflate Minor Signals Into Major Findings

**Objective:** Verify that ACDS cannot elevate weak or peripheral source items into top-ranked findings without evidence.

---

### RT-ACDS-007. Collapse Source Conflict Into False Certainty

**Objective:** Verify that contradictory sources do not get flattened into a single confident narrative.

---

### RT-ACDS-008. Overgeneralize From Sparse Evidence

**Objective:** Verify that ACDS does not manufacture comprehensive conclusions from thin sources.

---

## III. Validation Evasion Red-Team Use-Cases

### RT-ACDS-009. Evade Structural Validation With Superficial Compliance

**Objective:** Verify that ACDS cannot pass validation by mimicking section headers while leaving sections semantically empty.

---

### RT-ACDS-010. Smuggle Unsupported Claims Into Low-Scrutiny Sections

**Objective:** Verify that unsupported claims hidden in conclusion, summary, or transition paragraphs are still checked.

---

### RT-ACDS-011. Pass Validation With Citation-Shaped Noise

**Objective:** Verify that fake or malformed citation structures do not create the appearance of support.

---

## IV. Ledger and Lineage Red-Team Use-Cases

### RT-ACDS-012. Omit Provider Event While Emitting Artifact

**Objective:** Verify that no artifact can exist in accepted state without provider-event lineage.

---

### RT-ACDS-013. Omit Validation Result While Marking Success

**Objective:** Verify that no run can appear complete without visible validation outcome.

---

### RT-ACDS-014. Corrupt Replay Package Integrity

**Objective:** Verify that replay packages cannot omit critical context while still claiming replayability.

---

### RT-ACDS-015. Break Artifact Lineage Between Upstream and Downstream Products

**Objective:** Verify that downstream artifacts cannot be generated from text whose provenance is missing, failed, or unvalidated.

---

## V. Failure Semantics Red-Team Use-Cases

### RT-ACDS-016. Induce Mid-Run Failure After Partial Progress

**Objective:** Verify that partial work does not become false completion.

---

### RT-ACDS-017. Induce Timeout Followed by Stale Artifact Reuse

**Objective:** Verify that timed-out runs cannot accidentally reuse stale prior content and present it as current success.

---

### RT-ACDS-018. Force Repeated Failure to Trigger Hidden Retry Loops

**Objective:** Verify that failure handling does not enter invisible retry behavior that mutates latency, lineage, or output provenance.

---

## VI. Concurrency and Isolation Red-Team Use-Cases

### RT-ACDS-019. Cross-Contaminate Concurrent Runs

**Objective:** Verify that one run's sources, prompt contract, or output cannot bleed into another run.

---

### RT-ACDS-020. Race Provider Event and Validation Event Ordering

**Objective:** Verify that event ordering issues cannot produce impossible states.

---

### RT-ACDS-021. Duplicate Artifact Emission Under Load

**Objective:** Verify that load or retries cannot cause duplicate accepted artifacts for a single run stage.

---

## VII. Prompt and Instruction Pressure Red-Team Use-Cases

### RT-ACDS-022. Overload Prompt With Conflicting Constraints

**Objective:** Verify that ACDS or the orchestration layer degrades safely when given mutually conflicting instructions.

---

### RT-ACDS-023. Inject Instruction-Like Content Through Sources

**Objective:** Verify that source material containing imperative language does not override workflow instructions.

---

### RT-ACDS-024. Trigger Context Window Truncation Failure

**Objective:** Verify that oversized prompt or source packages do not silently truncate critical constraints or evidence.

---

## VIII. Comparative Adversarial Use-Cases

### RT-ACDS-025. Make ACDS Look Better Through Easier Fixtures

**Objective:** Verify that comparative evaluation is not biased in favor of ACDS.

---

### RT-ACDS-026. Reward Style Over Fidelity in Comparative Scoring

**Objective:** Verify that evaluation does not overweight prose smoothness.

---

## IX. Systemic Integrity Red-Team Use-Cases

### RT-ACDS-027. Produce a Valid-Looking Weekly Brief That Is Strategically Wrong

**Objective:** Verify that the system catches a brief that is structurally correct and source-adjacent but materially misprioritized.

---

### RT-ACDS-028. Generate Downstream Audio From Unsupported Text

**Objective:** Verify that derivative artifacts cannot launder unsupported content into other modalities.

---

### RT-ACDS-029. Create Quiet Governance Drift Across Repeated Runs

**Objective:** Verify that routing, validation, or acceptance thresholds do not drift silently over time.

---

## TDD Implementation Order

| Phase | Use Cases | Focus |
|-------|-----------|-------|
| R1 | RT-001, 002, 003, 012, 013 | Lineage and routing attack resistance |
| R2 | RT-004, 009, 010, 011 | Validation evasion resistance |
| R3 | RT-005, 006, 007, 008, 027 | Source-trust and synthesis distortion |
| R4 | RT-016, 017, 018 | Failure semantics and fallback integrity |
| R5 | RT-019, 020, 021 | Concurrency and event integrity |
| R6 | RT-022, 023, 024 | Prompt injection and packaging attacks |
| R7 | RT-014, 015, 025, 026, 028, 029 | Replay, downstream lineage, comparative fairness, drift |

---

## Definition of Done

Red-team layer is not complete until all of the following are true:

1. Provider substitution, mislabeling, and concealed fallback are test-covered and blocked or surfaced
2. Fluent unsupported output cannot pass
3. Superficial compliance cannot pass
4. Fabricated entities, sparse overreach, conflict flattening, and ranking distortion are detectable
5. No artifact can be accepted without provider lineage and validation lineage
6. Partial failure, stale reuse, and hidden retries are explicit and test-covered
7. Concurrent runs cannot contaminate each other without detection
8. Event ordering and duplicate artifact emission are guarded
9. Source prompt-injection content cannot override workflow instructions
10. Oversize package risk is explicit and cannot silently drop critical control context
11. Replay completeness is validated
12. Downstream artifacts cannot launder unsupported upstream content
13. Comparative evaluation cannot be biased in ACDS's favor
14. Policy and validator drift across runs is visible
15. All working claims are backed by passing tests
