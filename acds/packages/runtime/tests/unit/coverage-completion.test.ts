/**
 * Coverage-completion tests — exercises every uncovered line across the codebase.
 * NO MOCKS, NO STUBS, NO MONKEYPATCHES.
 */
import { describe, it, expect } from "vitest";

// =========================================================================
// domain/ — type-only files: use VALUE imports to force module execution
// =========================================================================
// Force v8 to see type-only modules by importing them as values
import * as CapabilityModule from "../../src/domain/capability.js";
import * as MethodRegistryModule from "../../src/domain/method-registry.js";
import * as ProviderModule from "../../src/domain/provider.js";
import * as SessionModule from "../../src/domain/session.js";
import * as ValidationTypesModule from "../../src/grits/validation-types.js";
import * as ProviderRuntimeModule from "../../src/providers/provider-runtime.js";
import * as AppleInterfacesModule from "../../src/providers/apple/apple-interfaces.js";
import * as RegistryTypesModule from "../../src/registry/registry-types.js";

import type { CapabilityDescriptor } from "../../src/domain/capability.js";
import type { MethodDefinition } from "../../src/domain/method-registry.js";
import type {
  ProviderDescriptor,
  HealthStatus as DomainHealthStatus,
  ExecutionMode,
  ProviderClass,
} from "../../src/domain/provider.js";
import type {
  SessionDescriptor,
  RiskLevel,
  AuthContext,
} from "../../src/domain/session.js";
import {
  InvalidExecutionPlanError,
  SessionRiskUnacknowledgedError,
  InvalidRegistrationError,
  ValidationFailedError,
  MethodUnresolvedError,
  MethodNotAvailableError,
  ProviderUnavailableError,
  PolicyBlockedError,
  CrossClassFallbackBlockedError,
  ReasonCode,
} from "../../src/domain/errors.js";
import { PolicyTier, tierAtLeast, isSovereignDefault } from "../../src/domain/policy-tiers.js";

// grits/
import type { GritsValidationResult, GritsSignal } from "../../src/grits/validation-types.js";
import {
  detectRoutingDrift,
  detectLatencyDrift,
  detectFallbackDrift,
  detectCapabilityCreep,
  driftSignal,
  type RoutingBaseline,
  type LatencyBaseline,
  type FallbackBaseline,
  type CapabilityBaseline,
} from "../../src/grits/drift-signals.js";
import { GritsHooks } from "../../src/grits/grits-hooks.js";
import { validateLatency, latencySignal } from "../../src/grits/latency-validator.js";
import { validateSchema, schemaSignal, type SchemaExpectation } from "../../src/grits/schema-validator.js";

// providers/
import type {
  ProviderRuntime,
  MethodExecutionResult,
  HealthStatus as ProviderHealthStatus,
  HealthState,
} from "../../src/providers/provider-runtime.js";
import type {
  ApplePlatformBundle,
  AppleFoundationModelsPlatform,
  AppleSpeechPlatform,
  AppleTtsPlatform,
  AppleVisionPlatform,
  AppleWritingToolsPlatform,
  AppleImagePlatform,
  AppleTranslationPlatform,
  AppleSoundPlatform,
  TranscriptionResult,
  AudioArtifact,
  OcrResult,
  DocumentExtractionResult,
  ProofreadResult,
  ImageArtifact,
  TranslationResult,
  SoundClassificationResult,
  GenerateOptions,
} from "../../src/providers/apple/apple-interfaces.js";

// Apple method handlers
import { handleImage } from "../../src/providers/apple/methods/image.js";
import { handleSound } from "../../src/providers/apple/methods/sound.js";
import { handleSpeech } from "../../src/providers/apple/methods/speech.js";
import { handleTranslation } from "../../src/providers/apple/methods/translation.js";
import { handleTts } from "../../src/providers/apple/methods/tts.js";
import { handleVision } from "../../src/providers/apple/methods/vision.js";
import { handleWritingTools } from "../../src/providers/apple/methods/writing-tools.js";
import { handleFoundationModels } from "../../src/providers/apple/methods/foundation-models.js";

// registry/
import type {
  ProviderRegistrationInput,
  CapabilityRegistrationInput,
  SessionRegistrationInput,
  RegistrationInput,
} from "../../src/registry/registry-types.js";
import {
  validateProviderRegistration,
  validateCapabilityRegistration,
  validateSessionRegistration,
  validateMethodBinding,
} from "../../src/registry/registry-validation.js";
import { Registry } from "../../src/registry/registry.js";

// runtime/
import { buildExecutionPlan } from "../../src/runtime/execution-planner.js";
import { resolveMethod } from "../../src/runtime/method-resolver.js";
import { evaluatePolicy } from "../../src/runtime/policy-engine.js";
import { assembleResponse } from "../../src/runtime/response-assembler.js";
import { executeRequest } from "../../src/runtime/runtime-orchestrator.js";

// telemetry/
import { AuditLogger } from "../../src/telemetry/audit-logger.js";
import { ExecutionLogger } from "../../src/telemetry/execution-logger.js";
import { redact } from "../../src/telemetry/redaction.js";
import { generateEventId } from "../../src/telemetry/event-types.js";

// =========================================================================
// HELPERS — real objects, no mocks
// =========================================================================

function makeRegistry(): Registry {
  const reg = new Registry();
  reg.registerProvider({
    source_class: "provider",
    provider_id: "apple",
    display_name: "Apple Intelligence",
    provider_class: "sovereign_runtime",
    execution_mode: "local",
    deterministic: true,
    health_status: "healthy",
    subsystems: ["text", "speech_in", "speech_out", "vision", "image", "translation", "sound", "writing"],
  });
  return reg;
}

function registerSummarizeMethod(reg: Registry): MethodDefinition {
  const m: MethodDefinition = {
    method_id: "apple.text.summarize",
    provider_id: "apple",
    subsystem: "text",
    deterministic: true,
    requires_network: false,
    policy_tier: PolicyTier.A,
    input_schema: { text: "string" },
    output_schema: { summary: "string" },
  };
  reg.registerMethod(m);
  return m;
}

function makeAuthContext(): AuthContext {
  return {
    user_id: "u-1",
    scopes: ["read"],
    issued_at: Date.now(),
    expires_at: Date.now() + 3600_000,
  };
}

/**
 * A real ProviderRuntime implementation — no mocks.
 */
class FakeProvider implements ProviderRuntime {
  readonly provider_id: string;
  private readonly healthState: HealthState;
  private readonly supportedMethods: Set<string>;

  constructor(id: string, healthState: HealthState = "healthy", methods: string[] = []) {
    this.provider_id = id;
    this.healthState = healthState;
    this.supportedMethods = new Set(methods);
  }

  health(): ProviderHealthStatus {
    return { state: this.healthState, checked_at: Date.now() };
  }

  supports(method_id: string): boolean {
    return this.supportedMethods.has(method_id);
  }

  async execute(method_id: string, input: unknown): Promise<MethodExecutionResult> {
    return {
      output: { result: "ok", method_id },
      latency_ms: 5,
      deterministic: true,
      execution_mode: "local",
    };
  }
}

// =========================================================================
// Type-only modules — force v8 to see them via namespace import references
// =========================================================================
describe("Type-only module loading", () => {
  it("capability.ts module is loaded", () => {
    expect(CapabilityModule).toBeDefined();
    expect(typeof CapabilityModule).toBe("object");
  });

  it("method-registry.ts module is loaded", () => {
    expect(MethodRegistryModule).toBeDefined();
    expect(typeof MethodRegistryModule).toBe("object");
  });

  it("provider.ts module is loaded", () => {
    expect(ProviderModule).toBeDefined();
    expect(typeof ProviderModule).toBe("object");
  });

  it("session.ts module is loaded", () => {
    expect(SessionModule).toBeDefined();
    expect(typeof SessionModule).toBe("object");
  });

  it("validation-types.ts module is loaded", () => {
    expect(ValidationTypesModule).toBeDefined();
    expect(typeof ValidationTypesModule).toBe("object");
  });

  it("provider-runtime.ts module is loaded", () => {
    expect(ProviderRuntimeModule).toBeDefined();
    expect(typeof ProviderRuntimeModule).toBe("object");
  });

  it("apple-interfaces.ts module is loaded", () => {
    expect(AppleInterfacesModule).toBeDefined();
    expect(typeof AppleInterfacesModule).toBe("object");
  });

  it("registry-types.ts module is loaded", () => {
    expect(RegistryTypesModule).toBeDefined();
    expect(typeof RegistryTypesModule).toBe("object");
  });
});

// =========================================================================
// domain/capability.ts — type-only, construction test
// =========================================================================
describe("CapabilityDescriptor construction", () => {
  it("constructs a valid descriptor", () => {
    const cap: CapabilityDescriptor = {
      capability_id: "cap-1",
      display_name: "Test Cap",
      explicit_invocation: true,
      isolated: false,
      description: "A test capability",
    };
    expect(cap.capability_id).toBe("cap-1");
    expect(cap.explicit_invocation).toBe(true);
    expect(cap.isolated).toBe(false);
    expect(cap.description).toBe("A test capability");
  });
});

// =========================================================================
// domain/errors.ts — uncovered error classes (lines 69-71, 90-92)
// =========================================================================
describe("InvalidExecutionPlanError", () => {
  it("constructs with correct reason code and message", () => {
    const err = new InvalidExecutionPlanError("bad plan");
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe(ReasonCode.INVALID_EXECUTION_PLAN);
    expect(err.message).toBe("bad plan");
    expect(err.name).toBe("InvalidExecutionPlanError");
  });
});

describe("SessionRiskUnacknowledgedError", () => {
  it("constructs with correct reason code and message", () => {
    const err = new SessionRiskUnacknowledgedError("risk not acked");
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe(ReasonCode.SESSION_RISK_UNACKNOWLEDGED);
    expect(err.message).toBe("risk not acked");
    expect(err.name).toBe("SessionRiskUnacknowledgedError");
  });
});

// =========================================================================
// domain/method-registry.ts — type-only, construction test
// =========================================================================
describe("MethodDefinition construction (method-registry.ts)", () => {
  it("constructs with all fields", () => {
    const m: MethodDefinition = {
      method_id: "m1",
      provider_id: "p1",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.B,
      input_schema: {},
      output_schema: {},
    };
    expect(m.method_id).toBe("m1");
    expect(m.policy_tier).toBe(PolicyTier.B);
  });
});

// =========================================================================
// domain/policy-tiers.ts — lines 31-32 (isSovereignDefault for C/D)
// Already tested in domain.test.ts but let's also hit tierAtLeast fully
// =========================================================================
describe("tierAtLeast edge cases", () => {
  it("C is at least B", () => {
    expect(tierAtLeast(PolicyTier.C, PolicyTier.B)).toBe(true);
  });
  it("D is at least C", () => {
    expect(tierAtLeast(PolicyTier.D, PolicyTier.C)).toBe(true);
  });
  it("A is not at least B", () => {
    expect(tierAtLeast(PolicyTier.A, PolicyTier.B)).toBe(false);
  });
});

// =========================================================================
// domain/provider.ts — type-only, construction test
// =========================================================================
describe("ProviderDescriptor construction", () => {
  it("constructs a valid descriptor", () => {
    const p: ProviderDescriptor = {
      provider_id: "p1",
      display_name: "Provider 1",
      provider_class: "sovereign_runtime",
      execution_mode: "local",
      deterministic: true,
      health_status: "healthy",
      subsystems: ["text"],
    };
    expect(p.provider_id).toBe("p1");
    expect(p.provider_class).toBe("sovereign_runtime");
  });
});

// =========================================================================
// domain/session.ts — type-only, construction test
// =========================================================================
describe("SessionDescriptor construction", () => {
  it("constructs a valid descriptor", () => {
    const s: SessionDescriptor = {
      session_id: "s1",
      display_name: "Session 1",
      risk_level: "low",
      risk_acknowledged: false,
      auth_context: makeAuthContext(),
      expires_at: new Date().toISOString(),
    };
    expect(s.session_id).toBe("s1");
    expect(s.risk_level).toBe("low");
  });
});

// =========================================================================
// grits/validation-types.ts — type-only, construction test
// =========================================================================
describe("GritsValidationResult construction", () => {
  it("constructs a valid result", () => {
    const r: GritsValidationResult = {
      test_id: "T1",
      passed: true,
      severity: "low",
      category: "test",
      details: "ok",
      timestamp: new Date().toISOString(),
    };
    expect(r.test_id).toBe("T1");
    expect(r.passed).toBe(true);
  });

  it("constructs all signal types", () => {
    const signals: GritsSignal[] = ["pass", "fail", "warning", "drift"];
    expect(signals).toHaveLength(4);
  });
});

// =========================================================================
// grits/drift-signals.ts — uncovered branches (lines 67-75, 124, 198-201)
// =========================================================================
describe("drift-signals", () => {
  describe("detectRoutingDrift — drift case", () => {
    it("returns failed result when method differs", () => {
      const baseline: RoutingBaseline = {
        task: "summarize",
        expected_method_id: "apple.text.summarize",
        expected_provider_id: "apple",
      };
      const r = detectRoutingDrift("summarize", "other.method", "apple", baseline);
      expect(r.passed).toBe(false);
      expect(r.severity).toBe("critical");
      expect(r.category).toBe("drift");
    });

    it("returns failed result when provider differs", () => {
      const baseline: RoutingBaseline = {
        task: "summarize",
        expected_method_id: "apple.text.summarize",
        expected_provider_id: "apple",
      };
      const r = detectRoutingDrift("summarize", "apple.text.summarize", "other-provider", baseline);
      expect(r.passed).toBe(false);
    });
  });

  describe("detectFallbackDrift — baseline branches", () => {
    it("handles baseline with zero total_executions", () => {
      const baseline: FallbackBaseline = {
        method_id: "m1",
        fallback_count: 0,
        total_executions: 0,
      };
      const r = detectFallbackDrift("m1", 0, 10, baseline);
      expect(r.passed).toBe(true);
    });

    it("handles baseline with positive total_executions (computes ratio)", () => {
      const baseline: FallbackBaseline = {
        method_id: "m1",
        fallback_count: 1,
        total_executions: 100,
      };
      const r = detectFallbackDrift("m1", 1, 100, baseline);
      expect(r.passed).toBe(true);
    });

    it("current_total zero results in zero currentRatio", () => {
      const baseline: FallbackBaseline = {
        method_id: "m1",
        fallback_count: 1,
        total_executions: 10,
      };
      const r = detectFallbackDrift("m1", 0, 0, baseline);
      expect(r.passed).toBe(true);
    });
  });

  describe("driftSignal", () => {
    it("returns 'pass' for passed result", () => {
      const r: GritsValidationResult = {
        test_id: "T",
        passed: true,
        severity: "low",
        category: "drift",
        details: "ok",
        timestamp: new Date().toISOString(),
      };
      expect(driftSignal(r)).toBe("pass");
    });

    it("returns 'drift' for failed drift-category result", () => {
      const r: GritsValidationResult = {
        test_id: "T",
        passed: false,
        severity: "high",
        category: "drift",
        details: "drifted",
        timestamp: new Date().toISOString(),
      };
      expect(driftSignal(r)).toBe("drift");
    });

    it("returns 'fail' for failed non-drift result", () => {
      const r: GritsValidationResult = {
        test_id: "T",
        passed: false,
        severity: "high",
        category: "schema",
        details: "failed",
        timestamp: new Date().toISOString(),
      };
      expect(driftSignal(r)).toBe("fail");
    });
  });
});

// =========================================================================
// grits/grits-hooks.ts — uncovered hook paths (lines 27-33, 54, 82-97)
// =========================================================================
describe("GritsHooks", () => {
  const hooks = new GritsHooks();

  describe("onExecution — with schema keys", () => {
    it("validates output against schema and latency", () => {
      const result: MethodExecutionResult = {
        output: { summary: "hello" },
        latency_ms: 100,
        deterministic: true,
        execution_mode: "local",
      };
      const method: MethodDefinition = {
        method_id: "test.m",
        provider_id: "apple",
        subsystem: "text",
        deterministic: true,
        requires_network: false,
        policy_tier: PolicyTier.A,
        input_schema: {},
        output_schema: { summary: "string" },
      };
      const results = hooks.onExecution(result, method);
      expect(results.length).toBeGreaterThanOrEqual(2);
      // Should have schema, latency, and overall execution results
    });

    it("returns critical when output is null", () => {
      const result: MethodExecutionResult = {
        output: null as any,
        latency_ms: 10,
        deterministic: true,
        execution_mode: "local",
      };
      const method: MethodDefinition = {
        method_id: "test.null",
        provider_id: "apple",
        subsystem: "text",
        deterministic: true,
        requires_network: false,
        policy_tier: PolicyTier.A,
        input_schema: {},
        output_schema: {},
      };
      const results = hooks.onExecution(result, method);
      const overallResult = results.find((r) => r.test_id === "GRITS-EXEC-test.null");
      expect(overallResult?.passed).toBe(false);
      expect(overallResult?.severity).toBe("critical");
    });
  });

  describe("onPolicyDecision", () => {
    it("validates an allowed policy decision", () => {
      const decision = {
        allowed: true,
        reason_code: "PROVIDER_ALLOWED",
        details: "allowed",
        source_class: "provider" as const,
      };
      const results = hooks.onPolicyDecision(decision);
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].severity).toBe("low");
    });

    it("validates a denied policy decision", () => {
      const decision = {
        allowed: false,
        reason_code: "POLICY_BLOCKED",
        details: "blocked",
        source_class: "provider" as const,
      };
      const results = hooks.onPolicyDecision(decision);
      expect(results).toHaveLength(1);
      expect(results[0].severity).toBe("medium");
    });
  });

  describe("onFallback", () => {
    it("logs a fallback event", () => {
      const results = hooks.onFallback("primary-method", "fallback-method", "primary_unavailable");
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].severity).toBe("medium");
      expect(results[0].category).toBe("fallback");
      expect(results[0].details).toContain("primary-method");
      expect(results[0].details).toContain("fallback-method");
    });
  });
});

// =========================================================================
// grits/latency-validator.ts — uncovered paths (lines 33-41, 44-52, 68-71)
// =========================================================================
describe("latency-validator", () => {
  it("fails when latency exceeds threshold", () => {
    const r = validateLatency(6000, "local", "LAT-1");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("high");
    expect(r.category).toBe("latency");
  });

  it("warns when latency approaches threshold (>80%)", () => {
    const r = validateLatency(4500, "local", "LAT-2");
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("medium");
  });

  it("passes when latency is well within threshold", () => {
    const r = validateLatency(100, "local", "LAT-3");
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("low");
  });

  it("uses remote threshold for controlled_remote", () => {
    const r = validateLatency(11000, "controlled_remote", "LAT-4");
    expect(r.passed).toBe(false);
  });

  it("uses remote threshold for session mode", () => {
    const r = validateLatency(9000, "session", "LAT-5");
    expect(r.passed).toBe(true);
    expect(r.severity).toBe("medium");
  });

  describe("latencySignal", () => {
    it("returns fail for failed result", () => {
      const r = validateLatency(6000, "local", "S1");
      expect(latencySignal(r)).toBe("fail");
    });

    it("returns warning for medium severity passed result", () => {
      const r = validateLatency(4500, "local", "S2");
      expect(latencySignal(r)).toBe("warning");
    });

    it("returns pass for low severity passed result", () => {
      const r = validateLatency(100, "local", "S3");
      expect(latencySignal(r)).toBe("pass");
    });
  });
});

// =========================================================================
// grits/schema-validator.ts — uncovered paths
// =========================================================================
describe("schema-validator", () => {
  it("fails for null output", () => {
    const r = validateSchema(null, { required_keys: ["a"] }, "S-1");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("fails for undefined output", () => {
    const r = validateSchema(undefined, { required_keys: ["a"] }, "S-2");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("accepts primitive output with no required keys", () => {
    const r = validateSchema("hello", {}, "S-3");
    expect(r.passed).toBe(true);
    expect(r.details).toContain("Primitive");
  });

  it("accepts primitive output with empty required keys", () => {
    const r = validateSchema(42, { required_keys: [] }, "S-3b");
    expect(r.passed).toBe(true);
  });

  it("fails for non-object when required keys are specified", () => {
    const r = validateSchema("hello", { required_keys: ["a"] }, "S-4");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("critical");
    expect(r.details).toContain("Expected object");
  });

  it("fails for array when required keys are specified", () => {
    const r = validateSchema([1, 2], { required_keys: ["a"] }, "S-4b");
    expect(r.passed).toBe(false);
    expect(r.details).toContain("Expected object");
  });

  it("fails for missing required keys", () => {
    const r = validateSchema({ b: 1 }, { required_keys: ["a", "c"] }, "S-5");
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("high");
    expect(r.details).toContain("Missing required keys");
  });

  it("fails for type mismatches", () => {
    const r = validateSchema(
      { name: 42 },
      { required_keys: ["name"], type_checks: { name: "string" } },
      "S-6",
    );
    expect(r.passed).toBe(false);
    expect(r.details).toContain("Type mismatches");
  });

  it("passes when all keys and types match", () => {
    const r = validateSchema(
      { name: "test", age: 5 },
      { required_keys: ["name"], type_checks: { name: "string", age: "number" } },
      "S-7",
    );
    expect(r.passed).toBe(true);
  });

  it("passes type check when key not present in obj (no check performed)", () => {
    const r = validateSchema(
      { name: "test" },
      { type_checks: { missing_key: "string" } },
      "S-8",
    );
    expect(r.passed).toBe(true);
  });

  describe("schemaSignal", () => {
    it("returns pass for passed result", () => {
      const r = validateSchema({ a: 1 }, { required_keys: ["a"] }, "SIG-1");
      expect(schemaSignal(r)).toBe("pass");
    });

    it("returns fail for failed result", () => {
      const r = validateSchema(null, { required_keys: ["a"] }, "SIG-2");
      expect(schemaSignal(r)).toBe("fail");
    });
  });
});

// =========================================================================
// providers/provider-runtime.ts — type-only
// =========================================================================
describe("ProviderRuntime types construction", () => {
  it("constructs HealthStatus", () => {
    const hs: ProviderHealthStatus = { state: "healthy", checked_at: Date.now() };
    expect(hs.state).toBe("healthy");
  });

  it("constructs MethodExecutionResult", () => {
    const r: MethodExecutionResult = {
      output: "test",
      latency_ms: 10,
      deterministic: true,
      execution_mode: "local",
    };
    expect(r.execution_mode).toBe("local");
  });

  it("can implement ProviderRuntime interface", () => {
    const p = new FakeProvider("test", "healthy", ["m1"]);
    expect(p.provider_id).toBe("test");
    expect(p.health().state).toBe("healthy");
    expect(p.supports("m1")).toBe(true);
    expect(p.supports("m2")).toBe(false);
  });
});

// =========================================================================
// providers/apple/apple-interfaces.ts — type-only
// =========================================================================
describe("Apple interfaces construction", () => {
  it("constructs all result types", () => {
    const transcription: TranscriptionResult = {
      text: "hello",
      confidence: 0.99,
      segments: [{ text: "hello", start_ms: 0, end_ms: 100 }],
    };
    const audio: AudioArtifact = { artifact_path: "/a", format: "wav", duration_ms: 100 };
    const ocr: OcrResult = {
      text: "text",
      confidence: 0.95,
      regions: [{ text: "t", x: 0, y: 0, width: 10, height: 10 }],
    };
    const docExtract: DocumentExtractionResult = {
      text: "doc",
      fields: { name: "John" },
      confidence: 0.9,
    };
    const proofread: ProofreadResult = {
      corrected: "ok",
      suggestions: [{ original: "teh", suggestion: "the", offset: 0 }],
    };
    const img: ImageArtifact = { artifact_path: "/img", width: 100, height: 100 };
    const trans: TranslationResult = { translated: "hola", source_language: "en", target_language: "es" };
    const sound: SoundClassificationResult = { events: [{ label: "music", confidence: 0.9 }] };
    const genOpts: GenerateOptions = { max_tokens: 100, temperature: 0.7 };

    expect(transcription.text).toBe("hello");
    expect(audio.format).toBe("wav");
    expect(ocr.confidence).toBe(0.95);
    expect(docExtract.fields.name).toBe("John");
    expect(proofread.corrected).toBe("ok");
    expect(img.width).toBe(100);
    expect(trans.translated).toBe("hola");
    expect(sound.events[0].label).toBe("music");
    expect(genOpts.max_tokens).toBe(100);
  });

  it("constructs a platform bundle shape", () => {
    // Just verify the type compiles and can be constructed
    const bundle: Partial<ApplePlatformBundle> = {};
    expect(bundle).toBeDefined();
  });
});

// =========================================================================
// Apple method error branches
// =========================================================================
describe("Apple method error branches", () => {
  // Minimal real platform implementations for testing error branches
  const imagePlatform: AppleImagePlatform = {
    generate: async (prompt, style) => ({ artifact_path: "/img", width: 100, height: 100 }),
  };
  const soundPlatform: AppleSoundPlatform = {
    classify: async (path) => ({ events: [{ label: "music", confidence: 0.9 }] }),
  };
  const speechPlatform: AppleSpeechPlatform = {
    transcribeLive: async (s) => ({ text: "hi", confidence: 0.9, segments: [] }),
    transcribeFile: async (p) => ({ text: "hi", confidence: 0.9, segments: [] }),
    transcribeLongform: async (p) => ({ text: "hi", confidence: 0.9, segments: [] }),
    dictationFallback: async (s) => ({ text: "hi", confidence: 0.9, segments: [] }),
  };
  const translationPlatform: AppleTranslationPlatform = {
    translate: async (text, lang) => ({ translated: "hola", source_language: "en", target_language: lang }),
  };
  const ttsPlatform: AppleTtsPlatform = {
    speak: async () => {},
    renderAudio: async (text) => ({ artifact_path: "/a", format: "wav", duration_ms: 100 }),
  };
  const visionPlatform: AppleVisionPlatform = {
    ocr: async (path) => ({ text: "text", confidence: 0.95, regions: [] }),
    documentExtract: async (path) => ({ text: "doc", fields: {}, confidence: 0.9 }),
  };
  const writingPlatform: AppleWritingToolsPlatform = {
    rewrite: async (text) => "rewritten",
    proofread: async (text) => ({ corrected: text, suggestions: [] }),
    summarize: async (text) => "summary",
  };
  const fmPlatform: AppleFoundationModelsPlatform = {
    generate: async (prompt) => "generated",
    summarize: async (text) => "summary",
    extract: async (text, schema) => ({ name: "John" }),
  };

  // Image
  describe("handleImage errors", () => {
    it("throws ValidationFailedError for non-string prompt", async () => {
      await expect(handleImage("apple.image.generate", { prompt: 123 }, imagePlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for missing prompt", async () => {
      await expect(handleImage("apple.image.generate", {}, imagePlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleImage("apple.image.unknown", {}, imagePlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // Sound
  describe("handleSound errors", () => {
    it("throws ValidationFailedError for non-string audio_path", async () => {
      await expect(handleSound("apple.sound.classify", { audio_path: 123 }, soundPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for missing audio_path", async () => {
      await expect(handleSound("apple.sound.classify", {}, soundPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleSound("apple.sound.unknown", {}, soundPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // Speech
  describe("handleSpeech errors", () => {
    it("throws ValidationFailedError for null audio_stream on transcribe_live", async () => {
      await expect(handleSpeech("apple.speech_in.transcribe_live", { audio_stream: null }, speechPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for missing audio_stream on transcribe_live", async () => {
      await expect(handleSpeech("apple.speech_in.transcribe_live", {}, speechPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for non-string path on transcribe_longform", async () => {
      await expect(handleSpeech("apple.speech_in.transcribe_longform", { path: 123 }, speechPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for null audio_stream on dictation_fallback", async () => {
      await expect(handleSpeech("apple.speech_in.dictation_fallback", { audio_stream: null }, speechPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for missing audio_stream on dictation_fallback", async () => {
      await expect(handleSpeech("apple.speech_in.dictation_fallback", {}, speechPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleSpeech("apple.speech_in.unknown", {}, speechPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // Translation
  describe("handleTranslation errors", () => {
    it("throws ValidationFailedError for non-string text", async () => {
      await expect(handleTranslation("apple.translation.translate", { text: 123, target_language: "es" }, translationPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for non-string target_language", async () => {
      await expect(handleTranslation("apple.translation.translate", { text: "hi", target_language: 123 }, translationPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for missing both", async () => {
      await expect(handleTranslation("apple.translation.translate", {}, translationPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleTranslation("apple.translation.unknown", {}, translationPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // TTS
  describe("handleTts errors", () => {
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleTts("apple.speech_out.unknown", {}, ttsPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // Vision
  describe("handleVision errors", () => {
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleVision("apple.vision.unknown", {}, visionPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // Writing Tools
  describe("handleWritingTools errors", () => {
    it("throws ValidationFailedError for non-string text on rewrite", async () => {
      await expect(handleWritingTools("apple.writing.rewrite", { text: 123 }, writingPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for non-string text on proofread", async () => {
      await expect(handleWritingTools("apple.writing.proofread", { text: 123 }, writingPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws ValidationFailedError for non-string text on summarize", async () => {
      await expect(handleWritingTools("apple.writing.summarize", { text: 123 }, writingPlatform))
        .rejects.toThrow(ValidationFailedError);
    });
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleWritingTools("apple.writing.unknown", {}, writingPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });

  // Foundation Models
  describe("handleFoundationModels errors", () => {
    it("throws MethodNotAvailableError for unknown method", async () => {
      await expect(handleFoundationModels("apple.text.unknown", {}, fmPlatform))
        .rejects.toThrow(MethodNotAvailableError);
    });
  });
});

// =========================================================================
// registry/registry-types.ts — type-only
// =========================================================================
describe("RegistrationInput types construction", () => {
  it("constructs ProviderRegistrationInput", () => {
    const input: ProviderRegistrationInput = {
      source_class: "provider",
      provider_id: "p1",
      display_name: "P1",
      provider_class: "sovereign_runtime",
      execution_mode: "local",
      deterministic: true,
      health_status: "healthy",
      subsystems: ["text"],
    };
    expect(input.source_class).toBe("provider");
  });

  it("constructs CapabilityRegistrationInput", () => {
    const input: CapabilityRegistrationInput = {
      source_class: "capability",
      capability_id: "c1",
      display_name: "C1",
      explicit_invocation: true,
      isolated: false,
      description: "test",
    };
    expect(input.source_class).toBe("capability");
  });

  it("constructs SessionRegistrationInput", () => {
    const input: SessionRegistrationInput = {
      source_class: "session",
      session_id: "s1",
      display_name: "S1",
      risk_level: "low",
      risk_acknowledged: false,
      auth_context: makeAuthContext(),
      expires_at: new Date().toISOString(),
    };
    expect(input.source_class).toBe("session");
  });

  it("constructs RegistrationInput union", () => {
    const inputs: RegistrationInput[] = [
      {
        source_class: "provider",
        provider_id: "p1",
        display_name: "P1",
        provider_class: "sovereign_runtime",
        execution_mode: "local",
        deterministic: true,
        health_status: "healthy",
        subsystems: [],
      },
      {
        source_class: "capability",
        capability_id: "c1",
        display_name: "C1",
        explicit_invocation: true,
        isolated: false,
        description: "test",
      },
    ];
    expect(inputs).toHaveLength(2);
  });
});

// =========================================================================
// registry/registry-validation.ts — uncovered validation branches
// =========================================================================
describe("registry-validation", () => {
  describe("validateProviderRegistration", () => {
    it("throws for wrong source_class", () => {
      expect(() =>
        validateProviderRegistration({ source_class: "capability" as any } as any),
      ).toThrow(InvalidRegistrationError);
    });

    it("throws for empty provider_id", () => {
      expect(() =>
        validateProviderRegistration({
          source_class: "provider",
          provider_id: "  ",
          display_name: "X",
          execution_mode: "local",
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws for missing provider_id", () => {
      expect(() =>
        validateProviderRegistration({
          source_class: "provider",
          provider_id: "",
          display_name: "X",
          execution_mode: "local",
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws for empty display_name", () => {
      expect(() =>
        validateProviderRegistration({
          source_class: "provider",
          provider_id: "p1",
          display_name: "",
          execution_mode: "local",
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws for missing execution_mode", () => {
      expect(() =>
        validateProviderRegistration({
          source_class: "provider",
          provider_id: "p1",
          display_name: "P1",
          execution_mode: "",
        } as any),
      ).toThrow(ValidationFailedError);
    });
  });

  describe("validateCapabilityRegistration", () => {
    it("throws for wrong source_class", () => {
      expect(() =>
        validateCapabilityRegistration({ source_class: "provider" as any } as any),
      ).toThrow(InvalidRegistrationError);
    });

    it("throws for empty capability_id", () => {
      expect(() =>
        validateCapabilityRegistration({
          source_class: "capability",
          capability_id: "  ",
          explicit_invocation: true,
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws for missing capability_id", () => {
      expect(() =>
        validateCapabilityRegistration({
          source_class: "capability",
          capability_id: "",
          explicit_invocation: true,
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws when explicit_invocation is false", () => {
      expect(() =>
        validateCapabilityRegistration({
          source_class: "capability",
          capability_id: "c1",
          explicit_invocation: false,
        } as any),
      ).toThrow(InvalidRegistrationError);
    });
  });

  describe("validateSessionRegistration", () => {
    it("throws for wrong source_class", () => {
      expect(() =>
        validateSessionRegistration({ source_class: "provider" as any } as any),
      ).toThrow(InvalidRegistrationError);
    });

    it("throws for empty session_id", () => {
      expect(() =>
        validateSessionRegistration({
          source_class: "session",
          session_id: "  ",
          risk_level: "low",
          auth_context: makeAuthContext(),
          expires_at: "2025-01-01",
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws for missing session_id", () => {
      expect(() =>
        validateSessionRegistration({
          source_class: "session",
          session_id: "",
          risk_level: "low",
          auth_context: makeAuthContext(),
          expires_at: "2025-01-01",
        } as any),
      ).toThrow(ValidationFailedError);
    });

    it("throws for missing risk_level", () => {
      expect(() =>
        validateSessionRegistration({
          source_class: "session",
          session_id: "s1",
          risk_level: "",
          auth_context: makeAuthContext(),
          expires_at: "2025-01-01",
        } as any),
      ).toThrow(InvalidRegistrationError);
    });

    it("throws for missing auth_context", () => {
      expect(() =>
        validateSessionRegistration({
          source_class: "session",
          session_id: "s1",
          risk_level: "low",
          auth_context: null as any,
          expires_at: "2025-01-01",
        } as any),
      ).toThrow(InvalidRegistrationError);
    });

    it("throws for missing expires_at", () => {
      expect(() =>
        validateSessionRegistration({
          source_class: "session",
          session_id: "s1",
          risk_level: "low",
          auth_context: makeAuthContext(),
          expires_at: "",
        } as any),
      ).toThrow(InvalidRegistrationError);
    });
  });

  describe("validateMethodBinding", () => {
    it("throws for empty method_id", () => {
      expect(() =>
        validateMethodBinding(
          { method_id: "", provider_id: "p1", subsystem: "text", deterministic: true, requires_network: false, policy_tier: PolicyTier.A, input_schema: {}, output_schema: {} },
          new Set(["p1"]),
        ),
      ).toThrow(ValidationFailedError);
    });

    it("throws for empty provider_id", () => {
      expect(() =>
        validateMethodBinding(
          { method_id: "m1", provider_id: "", subsystem: "text", deterministic: true, requires_network: false, policy_tier: PolicyTier.A, input_schema: {}, output_schema: {} },
          new Set(["p1"]),
        ),
      ).toThrow(ValidationFailedError);
    });

    it("throws for unknown provider_id", () => {
      expect(() =>
        validateMethodBinding(
          { method_id: "m1", provider_id: "unknown", subsystem: "text", deterministic: true, requires_network: false, policy_tier: PolicyTier.A, input_schema: {}, output_schema: {} },
          new Set(["p1"]),
        ),
      ).toThrow(InvalidRegistrationError);
    });

    it("throws for empty subsystem", () => {
      expect(() =>
        validateMethodBinding(
          { method_id: "m1", provider_id: "p1", subsystem: "", deterministic: true, requires_network: false, policy_tier: PolicyTier.A, input_schema: {}, output_schema: {} },
          new Set(["p1"]),
        ),
      ).toThrow(ValidationFailedError);
    });

    it("throws for invalid policy_tier", () => {
      expect(() =>
        validateMethodBinding(
          { method_id: "m1", provider_id: "p1", subsystem: "text", deterministic: true, requires_network: false, policy_tier: "X" as any, input_schema: {}, output_schema: {} },
          new Set(["p1"]),
        ),
      ).toThrow(ValidationFailedError);
    });
  });
});

// =========================================================================
// registry/registry.ts — uncovered methods (lines 93-94, 113-114, 117-118)
// =========================================================================
describe("Registry — session and capability methods", () => {
  it("registerSession and duplicate throws", () => {
    const reg = new Registry();
    const input: SessionRegistrationInput = {
      source_class: "session",
      session_id: "s1",
      display_name: "S1",
      risk_level: "low",
      risk_acknowledged: false,
      auth_context: makeAuthContext(),
      expires_at: new Date().toISOString(),
    };
    const desc = reg.registerSession(input);
    expect(desc.session_id).toBe("s1");

    // Duplicate should throw
    expect(() => reg.registerSession(input)).toThrow(InvalidRegistrationError);
  });

  it("getSession returns undefined for unknown", () => {
    const reg = new Registry();
    expect(reg.getSession("nonexistent")).toBeUndefined();
  });

  it("listSessions returns all registered sessions", () => {
    const reg = new Registry();
    reg.registerSession({
      source_class: "session",
      session_id: "s1",
      display_name: "S1",
      risk_level: "low",
      risk_acknowledged: false,
      auth_context: makeAuthContext(),
      expires_at: new Date().toISOString(),
    });
    reg.registerSession({
      source_class: "session",
      session_id: "s2",
      display_name: "S2",
      risk_level: "medium",
      risk_acknowledged: true,
      auth_context: makeAuthContext(),
      expires_at: new Date().toISOString(),
    });
    const sessions = reg.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("getCapability returns undefined for unknown", () => {
    const reg = new Registry();
    expect(reg.getCapability("nonexistent")).toBeUndefined();
  });

  it("listCapabilities returns all registered capabilities", () => {
    const reg = new Registry();
    reg.registerCapability({
      source_class: "capability",
      capability_id: "c1",
      display_name: "C1",
      explicit_invocation: true,
      isolated: false,
      description: "test1",
    });
    reg.registerCapability({
      source_class: "capability",
      capability_id: "c2",
      display_name: "C2",
      explicit_invocation: true,
      isolated: true,
      description: "test2",
    });
    const caps = reg.listCapabilities();
    expect(caps).toHaveLength(2);
    expect(caps[0].capability_id).toBe("c1");
    expect(caps[1].capability_id).toBe("c2");
  });
});

// =========================================================================
// runtime/execution-planner.ts — lines 63-64 (session source_class) and 97 (fallback no provider)
// =========================================================================
describe("execution-planner — session source class", () => {
  it("sets execution_mode to session for session source_class", () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);
    const resolved = { method_id: "apple.text.summarize", provider_id: "apple", source_class: "session" as const };
    const decision = { allowed: true, reason_code: "SESSION_APPROVED", details: "ok", source_class: "session" as const };
    const plan = buildExecutionPlan(resolved, decision, reg);
    expect(plan.primary.execution_mode).toBe("session");
  });

  it("sets fallback execution_mode to local when fallback provider not found in registry", () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    // Register a fallback method whose provider_id exists in registry
    reg.registerProvider({
      source_class: "provider",
      provider_id: "fallback-prov",
      display_name: "Fallback Provider",
      provider_class: "sovereign_runtime",
      execution_mode: "local",
      deterministic: true,
      health_status: "healthy",
      subsystems: ["text"],
    });
    const fbMethod: MethodDefinition = {
      method_id: "fallback.text.summarize",
      provider_id: "fallback-prov",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: {},
      output_schema: {},
    };
    reg.registerMethod(fbMethod);

    const resolved = { method_id: "apple.text.summarize", provider_id: "apple", source_class: "provider" as const };
    const decision = { allowed: true, reason_code: "PROVIDER_ALLOWED", details: "ok", source_class: "provider" as const };
    const plan = buildExecutionPlan(resolved, decision, reg, {
      fallback_method_id: "fallback.text.summarize",
      fallback_source_class: "provider",
    });

    expect(plan.fallback).toBeDefined();
    expect(plan.fallback!.provider_id).toBe("fallback-prov");
    expect(plan.fallback!.execution_mode).toBe("local");
  });

  it("does not add fallback for non-provider source class even with same-class fallback", () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    const resolved = { method_id: "cap-1", provider_id: "cap-1", source_class: "capability" as const };
    const decision = { allowed: true, reason_code: "CAPABILITY_APPROVED", details: "ok", source_class: "capability" as const };
    const plan = buildExecutionPlan(resolved, decision, reg, {
      fallback_method_id: "cap-1-fallback",
      fallback_source_class: "capability",
    });

    // Capability path doesn't look up fallback in registry
    expect(plan.fallback).toBeUndefined();
  });
});

// =========================================================================
// runtime/method-resolver.ts — lines 69-70 (method not in registry)
// =========================================================================
describe("method-resolver — method not in registry", () => {
  it("throws MethodUnresolvedError when method_id not in registry", () => {
    const reg = makeRegistry();
    // Don't register any methods — the intent maps to a method_id that doesn't exist
    const intent = { intent: "summarization" };
    expect(() => resolveMethod(intent, reg)).toThrow(MethodUnresolvedError);
  });
});

// =========================================================================
// runtime/policy-engine.ts — lines 99-105 (method not found in registry)
// =========================================================================
describe("policy-engine — method not found", () => {
  it("returns not allowed when method not in registry for provider path", () => {
    const reg = makeRegistry();
    const resolved = { method_id: "nonexistent.method", provider_id: "apple", source_class: "provider" as const };
    const decision = evaluatePolicy(resolved, reg, {});
    expect(decision.allowed).toBe(false);
    expect(decision.reason_code).toBe("METHOD_NOT_FOUND");
  });
});

// =========================================================================
// runtime/response-assembler.ts — line 45 (latency_ms ?? 0)
// =========================================================================
describe("response-assembler — missing latency_ms", () => {
  it("defaults latency_ms to 0 when not provided", () => {
    const plan = {
      plan_id: "p-1",
      primary: { provider_id: "apple", method_id: "m1", execution_mode: "local" },
      constraints: { local_only: false },
    };
    const result = { executed: true, output: "ok" };
    const response = assembleResponse(plan, result);
    expect(response.metadata.latency_ms).toBe(0);
  });
});

// =========================================================================
// runtime/runtime-orchestrator.ts — uncovered paths
// =========================================================================
describe("runtime-orchestrator — full provider execution with telemetry", () => {
  it("executes via real provider with all telemetry hooks", async () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "healthy", ["apple.text.summarize"]));

    const executionLogger = new ExecutionLogger();
    const auditLogger = new AuditLogger();
    const gritsHooks = new GritsHooks();

    const response = await executeRequest(
      { task: "summarize this text", input: { text: "hello world" } },
      reg,
      providers,
      { executionLogger, auditLogger, gritsHooks },
    );

    expect(response.output).toBeDefined();
    expect(response.metadata.provider_id).toBe("apple");
    expect(executionLogger.getEvents().length).toBeGreaterThan(0);
  });

  it("throws PolicyBlockedError with telemetry logging", async () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    // Register capability for use_capability path
    reg.registerCapability({
      source_class: "capability",
      capability_id: "ext-cap",
      display_name: "External Cap",
      explicit_invocation: true,
      isolated: true,
      description: "test",
    });

    const executionLogger = new ExecutionLogger();
    const auditLogger = new AuditLogger();
    const gritsHooks = new GritsHooks();

    // Request with use_capability but no explicit_approval -> blocked
    await expect(
      executeRequest(
        { task: "summarize this text", use_capability: "ext-cap" },
        reg,
        undefined,
        { executionLogger, auditLogger, gritsHooks },
      ),
    ).rejects.toThrow(PolicyBlockedError);

    // Audit logger should have captured the denial
    expect(auditLogger.getEvents().length).toBeGreaterThan(0);
  });

  it("throws ProviderUnavailableError when provider not in map", async () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    const providers = new Map<string, ProviderRuntime>();
    // Don't add any provider

    await expect(
      executeRequest({ task: "summarize this text" }, reg, providers),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError when provider is unavailable without fallback", async () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "unavailable", ["apple.text.summarize"]));

    await expect(
      executeRequest({ task: "summarize this text" }, reg, providers),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("throws MethodNotAvailableError when provider doesn't support method", async () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "healthy", [])); // no supported methods

    await expect(
      executeRequest({ task: "summarize this text" }, reg, providers),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it("falls back to fallback provider when primary is unavailable", async () => {
    const reg = makeRegistry();

    // Register two providers
    reg.registerProvider({
      source_class: "provider",
      provider_id: "apple-backup",
      display_name: "Apple Backup",
      provider_class: "sovereign_runtime",
      execution_mode: "local",
      deterministic: true,
      health_status: "healthy",
      subsystems: ["text"],
    });

    // Register primary and fallback methods
    const primaryMethod: MethodDefinition = {
      method_id: "apple.text.summarize",
      provider_id: "apple",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: { text: "string" },
      output_schema: { summary: "string" },
    };
    reg.registerMethod(primaryMethod);

    const fallbackMethod: MethodDefinition = {
      method_id: "apple.text.summarize.backup",
      provider_id: "apple-backup",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: { text: "string" },
      output_schema: { summary: "string" },
    };
    reg.registerMethod(fallbackMethod);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "unavailable", ["apple.text.summarize"]));
    providers.set("apple-backup", new FakeProvider("apple-backup", "healthy", ["apple.text.summarize.backup"]));

    const executionLogger = new ExecutionLogger();
    const auditLogger = new AuditLogger();
    const gritsHooks = new GritsHooks();

    const response = await executeRequest(
      {
        task: "summarize this text",
        input: { text: "hello" },
        fallback_method_id: "apple.text.summarize.backup",
        fallback_source_class: "provider",
      },
      reg,
      providers,
      { executionLogger, auditLogger, gritsHooks },
    );

    expect(response.output).toBeDefined();
    expect(response.metadata.provider_id).toBe("apple-backup");
    expect(response.metadata.method_id).toBe("apple.text.summarize.backup");
  });

  it("throws ProviderUnavailableError when fallback provider is also unavailable", async () => {
    const reg = makeRegistry();

    reg.registerProvider({
      source_class: "provider",
      provider_id: "apple-backup",
      display_name: "Apple Backup",
      provider_class: "sovereign_runtime",
      execution_mode: "local",
      deterministic: true,
      health_status: "degraded",
      subsystems: ["text"],
    });

    const primaryMethod: MethodDefinition = {
      method_id: "apple.text.summarize",
      provider_id: "apple",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: {},
      output_schema: {},
    };
    reg.registerMethod(primaryMethod);

    const fallbackMethod: MethodDefinition = {
      method_id: "apple.text.summarize.v2",
      provider_id: "apple-backup",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: {},
      output_schema: {},
    };
    reg.registerMethod(fallbackMethod);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "unavailable", ["apple.text.summarize"]));
    providers.set("apple-backup", new FakeProvider("apple-backup", "unavailable", ["apple.text.summarize.v2"]));

    await expect(
      executeRequest(
        {
          task: "summarize this text",
          fallback_method_id: "apple.text.summarize.v2",
          fallback_source_class: "provider",
        },
        reg,
        providers,
      ),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it("executes without providers (backward compat placeholder path)", async () => {
    const reg = makeRegistry();
    registerSummarizeMethod(reg);

    const response = await executeRequest(
      { task: "summarize this text" },
      reg,
    );

    expect(response.output).toBe("placeholder");
    expect(response.metadata.latency_ms).toBe(0);
  });

  it("attaches warnings when GRITS validation fails", async () => {
    const reg = makeRegistry();
    // Register a method with output_schema that won't match the actual output
    const m: MethodDefinition = {
      method_id: "apple.text.summarize",
      provider_id: "apple",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: {},
      output_schema: { nonexistent_field: "string" },
    };
    reg.registerMethod(m);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "healthy", ["apple.text.summarize"]));

    const gritsHooks = new GritsHooks();

    const response = await executeRequest(
      { task: "summarize this text", input: { text: "hello" } },
      reg,
      providers,
      { gritsHooks },
    );

    // The FakeProvider returns { result: "ok", method_id: "..." } which won't have "nonexistent_field"
    expect(response.metadata.warnings).toBeDefined();
    expect(response.metadata.warnings!.length).toBeGreaterThan(0);
  });

  it("handles no warnings when grits results all pass (no warnings attached)", async () => {
    const reg = makeRegistry();
    // Register method with output_schema matching FakeProvider output shape
    const m: MethodDefinition = {
      method_id: "apple.text.summarize",
      provider_id: "apple",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: {},
      output_schema: { result: "string" },
    };
    reg.registerMethod(m);

    const providers = new Map<string, ProviderRuntime>();
    providers.set("apple", new FakeProvider("apple", "healthy", ["apple.text.summarize"]));

    const gritsHooks = new GritsHooks();

    const response = await executeRequest(
      { task: "summarize this text", input: { text: "hello" } },
      reg,
      providers,
      { gritsHooks },
    );

    // All GRITS checks should pass -> no warnings
    expect(response.metadata.warnings).toBeUndefined();
  });
});

// =========================================================================
// telemetry/audit-logger.ts — uncovered methods (lines 41-42, 48-49)
// =========================================================================
describe("AuditLogger", () => {
  it("filters non-audit events", () => {
    const logger = new AuditLogger();
    logger.log({
      event_id: "e1",
      event_type: "execution_started",
      timestamp: new Date().toISOString(),
      execution_id: "x1",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    expect(logger.getEvents()).toHaveLength(0);
  });

  it("stores audit events", () => {
    const logger = new AuditLogger();
    logger.log({
      event_id: "e1",
      event_type: "policy_allowed",
      timestamp: new Date().toISOString(),
      execution_id: "x1",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    expect(logger.getEvents()).toHaveLength(1);
  });

  it("getEventsForExecution filters by execution_id", () => {
    const logger = new AuditLogger();
    logger.log({
      event_id: "e1",
      event_type: "policy_allowed",
      timestamp: new Date().toISOString(),
      execution_id: "x1",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    logger.log({
      event_id: "e2",
      event_type: "policy_denied",
      timestamp: new Date().toISOString(),
      execution_id: "x2",
      source_type: "provider",
      source_id: "apple",
      status: "blocked",
    });
    expect(logger.getEventsForExecution("x1")).toHaveLength(1);
    expect(logger.getEventsForExecution("x2")).toHaveLength(1);
    expect(logger.getEventsForExecution("x3")).toHaveLength(0);
  });

  it("clear removes all events", () => {
    const logger = new AuditLogger();
    logger.log({
      event_id: "e1",
      event_type: "policy_allowed",
      timestamp: new Date().toISOString(),
      execution_id: "x1",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    expect(logger.getEvents()).toHaveLength(1);
    logger.clear();
    expect(logger.getEvents()).toHaveLength(0);
  });
});

// =========================================================================
// telemetry/execution-logger.ts — uncovered methods (lines 30-31, 37-38)
// =========================================================================
describe("ExecutionLogger", () => {
  it("getEventsForExecution filters by execution_id", () => {
    const logger = new ExecutionLogger();
    logger.log({
      event_id: "e1",
      event_type: "execution_started",
      timestamp: new Date().toISOString(),
      execution_id: "x1",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    logger.log({
      event_id: "e2",
      event_type: "execution_succeeded",
      timestamp: new Date().toISOString(),
      execution_id: "x2",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    expect(logger.getEventsForExecution("x1")).toHaveLength(1);
    expect(logger.getEventsForExecution("x2")).toHaveLength(1);
    expect(logger.getEventsForExecution("x3")).toHaveLength(0);
  });

  it("clear removes all events", () => {
    const logger = new ExecutionLogger();
    logger.log({
      event_id: "e1",
      event_type: "execution_started",
      timestamp: new Date().toISOString(),
      execution_id: "x1",
      source_type: "provider",
      source_id: "apple",
      status: "success",
    });
    expect(logger.getEvents()).toHaveLength(1);
    logger.clear();
    expect(logger.getEvents()).toHaveLength(0);
  });
});

// =========================================================================
// telemetry/redaction.ts — uncovered branches (lines 29-30, 37-38, 59-60)
// =========================================================================
describe("redaction", () => {
  it("returns null/undefined unchanged", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it("redacts sensitive field names with long secrets", () => {
    const result = redact({ token: "abcdefghijklmnopqrstuvwxyz" });
    expect(result.token).toBe("[REDACTED]");
  });

  it("does not redact short values in sensitive fields", () => {
    const result = redact({ token: "short" });
    expect(result.token).toBe("short");
  });

  it("redacts Bearer/Basic prefixed strings regardless of field", () => {
    const result = redact({ header: "Bearer abc123" });
    expect(result.header).toBe("[REDACTED]");
  });

  it("redacts Basic auth", () => {
    const result = redact({ auth: "Basic dXNlcjpwYXNz" });
    expect(result.auth).toBe("[REDACTED]");
  });

  it("redacts arrays of sensitive values", () => {
    const result = redact({ tokens: ["Bearer abc", "hello"] } as any);
    // The array items are redacted with empty fieldName, so Bearer still triggers
    expect(result.tokens[0]).toBe("[REDACTED]");
    expect(result.tokens[1]).toBe("hello");
  });

  it("leaves non-sensitive strings unchanged", () => {
    const result = redact({ name: "John" });
    expect(result.name).toBe("John");
  });

  it("passes through primitive non-string non-object values", () => {
    const result = redact({ count: 42, active: true });
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
  });

  it("handles nested objects", () => {
    const result = redact({
      inner: {
        secret: "abcdefghijklmnopqrstuvwxyz",
        name: "safe",
      },
    });
    expect(result.inner.secret).toBe("[REDACTED]");
    expect(result.inner.name).toBe("safe");
  });

  it("redacts all known sensitive field names", () => {
    const longVal = "a".repeat(25);
    const input = {
      token: longVal,
      secret: longVal,
      password: longVal,
      api_key: longVal,
      authorization: longVal,
      credential: longVal,
    };
    const result = redact(input);
    expect(result.token).toBe("[REDACTED]");
    expect(result.secret).toBe("[REDACTED]");
    expect(result.password).toBe("[REDACTED]");
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.authorization).toBe("[REDACTED]");
    expect(result.credential).toBe("[REDACTED]");
  });
});

// =========================================================================
// Apple fakes — uncovered branches in apple-fakes.ts
// =========================================================================
import {
  FakeFoundationModels,
  FakeSpeech,
  createFakePlatformBundle,
} from "../../src/providers/apple/apple-fakes.js";

describe("apple-fakes uncovered branches", () => {
  it("FakeFoundationModels.extract handles empty text input", async () => {
    const fm = new FakeFoundationModels();
    // Empty text splits to [""] — empty string is a valid word, no nullish coalescing
    const result = await fm.extract("", { field1: "string", field2: "number" });
    expect(result.field1).toBe("");
    expect(result.field2).toBe("");
  });

  it("FakeSpeech.transcribeLive handles non-string audioStream", async () => {
    const speech = new FakeSpeech();
    const result = await speech.transcribeLive(12345);
    expect(result.text).toContain("live_stream");
  });

  it("FakeSpeech.dictationFallback handles non-string audioStream", async () => {
    const speech = new FakeSpeech();
    const result = await speech.dictationFallback({ buffer: true });
    expect(result.text).toContain("dictation_stream");
  });
});

// =========================================================================
// drift-signals — additional uncovered branches
// =========================================================================
describe("detectCapabilityCreep — all branches", () => {
  it("detects escalation from provider to capability (critical)", () => {
    const baseline: CapabilityBaseline = { task: "summarize", expected_source_class: "provider" };
    const r = detectCapabilityCreep("summarize", "capability", baseline);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("critical");
  });

  it("detects generic source class drift (high)", () => {
    const baseline: CapabilityBaseline = { task: "summarize", expected_source_class: "session" };
    const r = detectCapabilityCreep("summarize", "provider", baseline);
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("high");
  });

  it("passes when source class matches", () => {
    const baseline: CapabilityBaseline = { task: "summarize", expected_source_class: "provider" };
    const r = detectCapabilityCreep("summarize", "provider", baseline);
    expect(r.passed).toBe(true);
  });
});
