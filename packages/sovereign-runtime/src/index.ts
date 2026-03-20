// Domain
export type { SourceClass, SourceDefinition, ProviderDefinition, CapabilityDefinition, SessionDefinition } from './domain/source-types.js';
export type { MethodDefinition, Subsystem } from './domain/method-registry.js';
export { PolicyTier, POLICY_TIER_LABELS, SOVEREIGN_ALLOWED_TIERS } from './domain/policy-tiers.js';
export type { ACDSMethodRequest } from './domain/execution-request.js';
export type { ACDSMethodResponse } from './domain/execution-response.js';
export type { CapabilityCategory, CapabilityContract } from './domain/capability-contract.js';
export { CAPABILITY_IDS, CAPABILITY_CONTRACTS } from './domain/capability-taxonomy.js';
export type { CapabilityId } from './domain/capability-taxonomy.js';
export type { CostModel, CostProfile, LatencyProfile, CostConstraints } from './domain/cost-types.js';
export { FREE_COST, LOCAL_LATENCY } from './domain/cost-types.js';
export type { ScoreWeights, ProviderScore, ScoringResult } from './domain/score-types.js';
export { DEFAULT_WEIGHTS } from './domain/score-types.js';
export {
  ACDSRuntimeError,
  MethodUnresolvedError,
  MethodNotAvailableError,
  ProviderUnavailableError,
  PolicyBlockedError,
  InvalidRegistrationError,
  InvalidExecutionPlanError,
  ValidationFailedError,
} from './domain/errors.js';
export type { ErrorReasonCode } from './domain/errors.js';

// Registry
export type { RegistryEntry, RegistryQuery, ProviderHealthState } from './registry/registry-types.js';
export { SourceRegistry } from './registry/registry.js';
export { validateSourceDefinition, validateMethodBinding, rejectMixedClassRegistration } from './registry/registry-validation.js';
export { createDefaultRegistry, createDefaultCapabilityRegistry, APPLE_RUNTIME_PROVIDER } from './registry/default-registry.js';
export type { CapabilityBinding } from './registry/capability-binding.js';
export { CapabilityRegistry } from './registry/capability-registry.js';

// Runtime Pipeline
export { resolveIntent } from './runtime/intent-resolver.js';
export type { Intent, ResolvedIntent } from './runtime/intent-resolver.js';
export { resolveMethod } from './runtime/method-resolver.js';
export type { MethodResolution } from './runtime/method-resolver.js';
export { evaluatePolicy, validateFallbackClass } from './runtime/policy-engine.js';
export type { PolicyDecision } from './runtime/policy-engine.js';
export { buildExecutionPlan } from './runtime/execution-planner.js';
export type { ExecutionPlan } from './runtime/execution-planner.js';
export { assembleResponse } from './runtime/response-assembler.js';
export { RuntimeOrchestrator } from './runtime/runtime-orchestrator.js';
export type { OrchestratorDeps, FallbackMapping } from './runtime/runtime-orchestrator.js';
export { scoreProviders } from './runtime/provider-scorer.js';
export { enforceCostCeiling } from './runtime/cost-enforcer.js';
export type { CostEnforcementResult } from './runtime/cost-enforcer.js';
export { CapabilityOrchestrator } from './runtime/capability-orchestrator.js';
export type { CapabilityRequest, CapabilityResponse, CapabilityOrchestratorDeps } from './runtime/capability-orchestrator.js';

// Provider Runtime
export type { ProviderRuntime, MethodExecutionResult, ProviderHealthResult } from './providers/provider-runtime.js';

// Apple Runtime
export { AppleRuntimeAdapter } from './providers/apple/apple-runtime-adapter.js';
export { APPLE_METHODS } from './providers/apple/apple-method-registry.js';

// Telemetry
export { ExecutionLogger } from './telemetry/execution-logger.js';
export type { ExecutionLogEvent, PolicyAuditEvent, FallbackAuditEvent } from './telemetry/event-types.js';
export { redactLogEvent, redactTokensInString } from './telemetry/redaction.js';
export { LineageBuilder } from './telemetry/lineage-builder.js';
export type { LineageStep, ExecutionLineage } from './telemetry/lineage-builder.js';

// GRITS
export type { ValidationResult, GRITSHookEvent, GRITSSeverity, GRITSStatus } from './grits/validation-types.js';
export { validateOutputSchema } from './grits/schema-validator.js';
export { validateLatency } from './grits/latency-validator.js';
export { checkResolverDrift, checkCapabilityCreep, emitDriftSignal } from './grits/drift-signals.js';
export type { DriftSignal, DriftSignalType } from './grits/drift-signals.js';
export { GRITSHookRunner } from './grits/grits-hooks.js';
export type { GRITSHookConfig } from './grits/grits-hooks.js';

// Artifact Pipeline
export * from './artifact/index.js';

// Fixtures
export { FIXTURES_APPLE_PROVIDER, FIXTURES_OLLAMA_PROVIDER, FIXTURES_OPENAI_CAPABILITY, FIXTURES_OPENAI_SESSION } from './fixtures/provider-fixtures.js';
export { TASK_FIXTURES } from './fixtures/task-fixtures.js';
export { makeSuccessResponse } from './fixtures/response-fixtures.js';
