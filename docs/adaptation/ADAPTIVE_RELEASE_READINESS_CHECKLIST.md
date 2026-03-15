# Adaptive Release Readiness Checklist

This checklist validates that the ACDS adaptive optimization subsystem is ready for production deployment. Each section must be reviewed and signed off before the adaptive features are enabled.

---

## 1. Architecture Integrity

- [ ] **Evaluation layer** (`@acds/evaluation`) produces metric scores for all six dimensions: acceptance, schema compliance, correction burden, latency, cost, unsupported claims.
- [ ] **Scoring pipeline** (`ExecutionScoreCalculator`) computes weighted composite scores with configurable `ApplicationWeightResolver`.
- [ ] **Aggregation pipeline** (`ExecutionHistoryAggregator`, `FamilyPerformanceSummary`) rolls execution scores into family-level rolling averages and trend signals.
- [ ] **Optimizer state** (`FamilySelectionState`, `CandidatePerformanceState`) is persisted via `OptimizerStateRepository` and survives restarts.
- [ ] **Candidate ranking** (`CandidateRanker`) produces deterministic rankings from the same input state.
- [ ] **Exploration/exploitation policies** (`ExplorationPolicy`, `ExploitationPolicy`) correctly balance between trying alternatives and using the best-known candidate.
- [ ] **Adaptive selection** (`AdaptiveSelectionService.select()`) respects the configured `AdaptiveMode` and never selects ineligible candidates.
- [ ] **Plateau detection** (`PlateauDetector.detect()`) correctly identifies stagnation signals with appropriate severity levels.
- [ ] **Recommendation generation** (`AdaptationRecommendationService`) creates recommendations only for modes that require human review.
- [ ] **Adaptation events** (`AdaptationEventBuilder`, `AdaptationLedgerWriter`) record all ranking changes with full before/after snapshots.
- [ ] **Routing integration** (`AdaptiveDispatchResolver`, `AdaptiveCandidatePortfolioBuilder`) translates optimizer selections into routing decisions without bypassing eligibility.
- [ ] **Execution bridge** (`ExecutionEvaluationBridge`, `ExecutionOutcomePublisher`) connects execution outcomes back to the evaluation pipeline.

## 2. Data / State Integrity

- [ ] **Family selection state** schema includes all required fields: `familyKey`, `currentCandidateId`, `rollingScore`, `runCount`, `explorationRate`, `recentTrend`, `lastSelectedAt`.
- [ ] **Candidate performance state** schema includes all required fields: `candidateId`, `familyKey`, `rollingScore`, `runCount`, `successRate`, `averageLatency`, `lastSelectedAt`.
- [ ] **Rolling score calculations** use a consistent windowing strategy across aggregation and ranking.
- [ ] **State transitions** are atomic -- no partial updates can leave the optimizer in an inconsistent state.
- [ ] **Ranking snapshots** (`RankingSnapshot`) faithfully capture candidate orderings and exploration rates at the time of capture.
- [ ] **Adaptation events** are immutable once written to the ledger.
- [ ] **Database migrations** for optimizer state tables have been tested in staging.

## 3. Evaluation Integrity

- [ ] **Acceptance metric** correctly classifies accepted vs. rejected outcomes.
- [ ] **Schema compliance metric** validates output structure against expected schemas.
- [ ] **Correction burden metric** measures manual correction effort accurately.
- [ ] **Latency metric** compares execution time against configurable thresholds.
- [ ] **Cost metric** tracks token and API costs against budget ceilings.
- [ ] **Unsupported claim metric** detects factual grounding failures.
- [ ] **Weight resolution** (`ApplicationWeightResolver`) returns appropriate weights for each known application.
- [ ] **Improvement signal builder** (`ImprovementSignalBuilder`) correctly identifies improving, stable, and declining trends.
- [ ] **Family performance summaries** aggregate metric trends accurately across evaluation windows.

## 4. Control Workflow Integrity

- [ ] **Approval states** (`pending`, `approved`, `rejected`, `expired`, `superseded`) transition correctly per the state machine.
- [ ] **Approval submission** (`AdaptationApprovalService.submitForApproval()`) creates a pending approval with correct expiry.
- [ ] **Approve path** (`AdaptationApprovalService.approve()`) transitions pending to approved and emits `approval_approved` audit event.
- [ ] **Reject path** (`AdaptationApprovalService.reject()`) transitions pending to rejected and emits `approval_rejected` audit event.
- [ ] **Expiry sweep** (`AdaptationApprovalService.expireStale()`) expires pending approvals past their deadline and emits `approval_expired` audit events.
- [ ] **Terminal states** are enforced -- approved, rejected, expired, and superseded approvals cannot be modified.
- [ ] **Low-risk auto-apply** (`LowRiskAutoApplyService`) qualifies families based on risk level, posture, recent failures, and rolling score.
- [ ] **Auto-apply refusal** correctly blocks high-consequence families, final/evidentiary postures, families with recent failures, and families with low rolling scores.
- [ ] **Auto-apply decision records** (`AutoApplyDecisionRecord`) are persisted with full audit trail for every auto-applied change.
- [ ] **Rollback preview** (`AdaptationRollbackService.previewRollback()`) returns accurate safety assessments without mutating state.
- [ ] **Rollback execution** (`AdaptationRollbackService.executeRollback()`) restores prior ranking state and emits `rollback_executed` audit event.
- [ ] **Rollback safety checks** correctly identify unsafe conditions (missing events, family mismatch, stale events, empty rankings).
- [ ] **Escalation tuning** (`EscalationTuningService.evaluateAndTune()`) respects forced escalation for final/evidentiary postures.
- [ ] **Escalation confidence floor** falls back to `normal_escalate` when confidence is below the policy threshold.

## 5. API / UI Integrity

- [ ] **GET /adaptation/families** returns family performance summaries.
- [ ] **GET /adaptation/families/:key** returns family detail with metric trends.
- [ ] **GET /adaptation/families/:key/candidates** returns candidate rankings.
- [ ] **GET /adaptation/events** returns adaptation event history (filterable by family).
- [ ] **GET /adaptation/recommendations** returns adaptation recommendations.
- [ ] **GET /adaptation/approvals** returns approvals (filterable by status and family).
- [ ] **GET /adaptation/approvals/:id** returns approval detail with ranking comparisons.
- [ ] **POST /adaptation/approvals/:id/approve** approves a pending recommendation.
- [ ] **POST /adaptation/approvals/:id/reject** rejects a pending recommendation.
- [ ] **POST /adaptation/rollbacks/:familyKey/preview** returns rollback preview with safety assessment.
- [ ] **POST /adaptation/rollbacks/:familyKey/execute** executes a rollback with audit trail.
- [ ] **Admin web adaptation dashboard** (`/adaptation`) displays family performance table and plateau alerts.
- [ ] **Family detail page** (`/adaptation/:familyKey`) displays metric trends and candidate rankings.
- [ ] **Approval queue page** (`/adaptation/approvals`) lists approvals with status filtering.
- [ ] **Approval detail page** (`/adaptation/approvals/:id`) displays evidence, rankings, and decision panel.
- [ ] **Rollback queue page** (`/adaptation/rollbacks`) lists rollback candidates and history.
- [ ] **Rollback detail page** (`/adaptation/rollbacks/:familyKey`) displays preview and execution controls.
- [ ] **Router** includes all new routes for approval and rollback screens.

## 6. Worker Integrity

- [ ] **Execution scoring job** (`executionScoringJob`) scores new execution outcomes on schedule.
- [ ] **Family aggregation job** (`familyAggregationJob`) updates family rolling scores and trends.
- [ ] **Plateau detection job** (`plateauDetectionJob`) detects and records plateau signals.
- [ ] **Adaptation recommendation job** (`adaptationRecommendationJob`) generates recommendations and manages auto-apply.
- [ ] **Job registration** (`registerJobs`) includes all four adaptive worker jobs.
- [ ] **Job error handling** logs failures without crashing the worker process.
- [ ] **Job scheduling** uses appropriate intervals (not too frequent, not too infrequent).

## 7. Test Integrity

- [ ] **Unit tests** pass for all evaluation metrics, scoring, ranking, and selection logic.
- [ ] **Integration test: adaptationApi** validates family, event, and recommendation API surfaces.
- [ ] **Integration test: adaptiveRoutingIntegration** validates end-to-end adaptive routing flow.
- [ ] **Integration test: adaptiveSelection** validates candidate selection under different modes.
- [ ] **Integration test: evaluationScoring** validates metric calculation and score aggregation.
- [ ] **Integration test: plateauDetection** validates plateau signal detection and severity classification.
- [ ] **Integration test: adaptationApprovalWorkflow** validates approval creation, approve, reject, and audit emission.
- [ ] **Integration test: lowRiskAutoApply** validates qualification, refusal, and audit recording.
- [ ] **Integration test: adaptationRollback** validates preview, execution, invalid rejection, and audit emission.
- [ ] **Integration test: escalationTuningBridge** validates tuning preferences and policy hard stops.
- [ ] **Integration test: adaptiveControlApi** validates approval and rollback API endpoint behavior.
- [ ] **All tests** run without flakiness in CI.

## 8. Operational Readiness

- [ ] **Monitoring** is configured for key adaptive metrics: family rolling scores, plateau signal counts, recommendation generation rate, approval queue depth.
- [ ] **Alerting** is configured for: severe plateau signals, high approval queue depth, auto-apply failures, rollback executions.
- [ ] **Logging** captures all adaptation events, approval decisions, auto-apply actions, and rollback operations at appropriate verbosity.
- [ ] **Documentation** is complete and accurate:
  - [ADAPTIVE_OVERVIEW.md](./ADAPTIVE_OVERVIEW.md) -- system architecture and data flow.
  - [ADAPTIVE_MODES.md](./ADAPTIVE_MODES.md) -- mode definitions and progression.
  - [APPROVAL_WORKFLOW.md](./APPROVAL_WORKFLOW.md) -- approval lifecycle and API.
  - [AUTO_APPLY_LOW_RISK.md](./AUTO_APPLY_LOW_RISK.md) -- qualification criteria and guardrails.
  - [ROLLBACK_OPERATIONS.md](./ROLLBACK_OPERATIONS.md) -- rollback mechanics and safety checks.
  - [ESCALATION_TUNING.md](./ESCALATION_TUNING.md) -- tuning logic and policy constraints.
  - [OPERATOR_PLAYBOOK.md](./OPERATOR_PLAYBOOK.md) -- daily/weekly procedures.
- [ ] **Initial adaptive mode** for all families is set to `observe_only` for the first deployment.
- [ ] **Rollback plan** is documented: if the adaptive system causes issues, all families can be set to `observe_only` to disable active adaptation without shutting down evaluation.
- [ ] **Performance impact** has been assessed: worker job frequency does not overload the database, API endpoints respond within acceptable latency bounds.

## 9. Go / No-Go

| Area | Reviewer | Status | Date |
|---|---|---|---|
| Architecture Integrity | _______________ | _______ | _______ |
| Data / State Integrity | _______________ | _______ | _______ |
| Evaluation Integrity | _______________ | _______ | _______ |
| Control Workflow Integrity | _______________ | _______ | _______ |
| API / UI Integrity | _______________ | _______ | _______ |
| Worker Integrity | _______________ | _______ | _______ |
| Test Integrity | _______________ | _______ | _______ |
| Operational Readiness | _______________ | _______ | _______ |

**Final Decision:**

- [ ] **GO** -- All sections reviewed, all items pass. Adaptive optimization is approved for production.
- [ ] **NO-GO** -- One or more sections have unresolved items. List blockers below.

**Blockers (if NO-GO):**

1. _______________
2. _______________
3. _______________

**Sign-off:**

| Role | Name | Signature | Date |
|---|---|---|---|
| Engineering Lead | _______________ | _______________ | _______ |
| Operations Lead | _______________ | _______________ | _______ |
| Product Owner | _______________ | _______________ | _______ |
