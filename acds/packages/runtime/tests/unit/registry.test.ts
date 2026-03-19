import { describe, it, expect, beforeEach } from "vitest";
import { Registry } from "../../src/registry/registry.js";
import { createDefaultRegistry, APPLE_METHODS } from "../../src/registry/default-registry.js";
import { PolicyTier } from "../../src/domain/policy-tiers.js";
import { InvalidRegistrationError, ValidationFailedError } from "../../src/domain/errors.js";
import type { ProviderRegistrationInput, CapabilityRegistrationInput, SessionRegistrationInput } from "../../src/registry/registry-types.js";
import type { MethodDefinition } from "../../src/domain/method-registry.js";

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------
function validProvider(overrides?: Partial<ProviderRegistrationInput>): ProviderRegistrationInput {
  return {
    source_class: "provider",
    provider_id: "test-provider",
    display_name: "Test Provider",
    provider_class: "local_runtime",
    execution_mode: "local",
    deterministic: true,
    health_status: "healthy",
    subsystems: ["text"],
    ...overrides,
  };
}

function validCapability(overrides?: Partial<CapabilityRegistrationInput>): CapabilityRegistrationInput {
  return {
    source_class: "capability",
    capability_id: "test-capability",
    display_name: "Test Capability",
    explicit_invocation: true,
    isolated: false,
    description: "A test capability",
    ...overrides,
  };
}

function validSession(overrides?: Partial<SessionRegistrationInput>): SessionRegistrationInput {
  return {
    source_class: "session",
    session_id: "test-session",
    display_name: "Test Session",
    risk_level: "high",
    risk_acknowledged: true,
    auth_context: {
      user_id: "user-1",
      scopes: ["read"],
      issued_at: Date.now(),
      expires_at: Date.now() + 3600_000,
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  };
}

function validMethod(overrides?: Partial<MethodDefinition>): MethodDefinition {
  return {
    method_id: "test.text.generate",
    provider_id: "test-provider",
    subsystem: "text",
    deterministic: true,
    requires_network: false,
    policy_tier: PolicyTier.A,
    input_schema: {},
    output_schema: {},
    ...overrides,
  };
}

// -------------------------------------------------------------------------
// Registration success
// -------------------------------------------------------------------------
describe("Registry -- successful registrations", () => {
  let reg: Registry;
  beforeEach(() => {
    reg = new Registry();
  });

  it("valid provider registration succeeds", () => {
    const desc = reg.registerProvider(validProvider());
    expect(desc.provider_id).toBe("test-provider");
    expect(desc.execution_mode).toBe("local");
  });

  it("valid capability registration succeeds", () => {
    const desc = reg.registerCapability(validCapability());
    expect(desc.capability_id).toBe("test-capability");
    expect(desc.explicit_invocation).toBe(true);
  });

  it("valid session registration succeeds", () => {
    const desc = reg.registerSession(validSession());
    expect(desc.session_id).toBe("test-session");
    expect(desc.risk_level).toBe("high");
  });
});

// -------------------------------------------------------------------------
// Mixed-class rejection
// -------------------------------------------------------------------------
describe("Registry -- mixed-class rejection", () => {
  let reg: Registry;
  beforeEach(() => {
    reg = new Registry();
  });

  it("rejects local runtime registered as session", () => {
    // Attempting to register something with local_runtime traits as a session
    // is caught because source_class must match the registration method.
    const bad = {
      ...validSession(),
      source_class: "provider" as const,
    };
    // Calling registerSession with a provider source_class
    expect(() =>
      reg.registerSession(bad as unknown as SessionRegistrationInput),
    ).toThrow(InvalidRegistrationError);
  });

  it("rejects session registered as provider", () => {
    const bad = {
      ...validProvider(),
      source_class: "session" as const,
    };
    expect(() =>
      reg.registerProvider(bad as unknown as ProviderRegistrationInput),
    ).toThrow(InvalidRegistrationError);
  });
});

// -------------------------------------------------------------------------
// Validation failures
// -------------------------------------------------------------------------
describe("Registry -- validation failures", () => {
  let reg: Registry;
  beforeEach(() => {
    reg = new Registry();
  });

  it("capability without explicit_invocation=true is rejected", () => {
    expect(() =>
      reg.registerCapability(
        validCapability({ explicit_invocation: false } as unknown as Partial<CapabilityRegistrationInput>),
      ),
    ).toThrow(InvalidRegistrationError);
  });

  it("session without risk metadata is rejected", () => {
    expect(() =>
      reg.registerSession(
        validSession({ risk_level: undefined } as unknown as Partial<SessionRegistrationInput>),
      ),
    ).toThrow(InvalidRegistrationError);
  });

  it("session without auth_context is rejected", () => {
    expect(() =>
      reg.registerSession(
        validSession({ auth_context: undefined } as unknown as Partial<SessionRegistrationInput>),
      ),
    ).toThrow(InvalidRegistrationError);
  });

  it("session without expires_at is rejected", () => {
    expect(() =>
      reg.registerSession(
        validSession({ expires_at: undefined } as unknown as Partial<SessionRegistrationInput>),
      ),
    ).toThrow(InvalidRegistrationError);
  });
});

// -------------------------------------------------------------------------
// Method binding
// -------------------------------------------------------------------------
describe("Registry -- method binding", () => {
  let reg: Registry;
  beforeEach(() => {
    reg = new Registry();
    reg.registerProvider(validProvider());
  });

  it("method with wrong provider_id is rejected", () => {
    expect(() =>
      reg.registerMethod(validMethod({ provider_id: "nonexistent" })),
    ).toThrow(InvalidRegistrationError);
  });

  it("valid method binding succeeds", () => {
    const m = reg.registerMethod(validMethod());
    expect(m.method_id).toBe("test.text.generate");
  });
});

// -------------------------------------------------------------------------
// Duplicate rejection
// -------------------------------------------------------------------------
describe("Registry -- duplicate rejection", () => {
  let reg: Registry;
  beforeEach(() => {
    reg = new Registry();
  });

  it("duplicate provider registration is rejected", () => {
    reg.registerProvider(validProvider());
    expect(() => reg.registerProvider(validProvider())).toThrow(InvalidRegistrationError);
  });

  it("duplicate capability registration is rejected", () => {
    reg.registerCapability(validCapability());
    expect(() => reg.registerCapability(validCapability())).toThrow(InvalidRegistrationError);
  });

  it("duplicate session registration is rejected", () => {
    reg.registerSession(validSession());
    expect(() => reg.registerSession(validSession())).toThrow(InvalidRegistrationError);
  });

  it("duplicate method registration is rejected", () => {
    reg.registerProvider(validProvider());
    reg.registerMethod(validMethod());
    expect(() => reg.registerMethod(validMethod())).toThrow(InvalidRegistrationError);
  });
});

// -------------------------------------------------------------------------
// Queries
// -------------------------------------------------------------------------
describe("Registry -- queries", () => {
  let reg: Registry;
  beforeEach(() => {
    reg = new Registry();
    reg.registerProvider(validProvider());
    reg.registerProvider(validProvider({ provider_id: "second-provider", display_name: "Second" }));
  });

  it("listProviders returns all registered providers", () => {
    const providers = reg.listProviders();
    expect(providers).toHaveLength(2);
    const ids = providers.map((p) => p.provider_id);
    expect(ids).toContain("test-provider");
    expect(ids).toContain("second-provider");
  });

  it("getMethod returns correct method", () => {
    reg.registerMethod(validMethod());
    const m = reg.getMethod("test.text.generate");
    expect(m).toBeDefined();
    expect(m!.provider_id).toBe("test-provider");
    expect(m!.policy_tier).toBe(PolicyTier.A);
  });

  it("getMethodsForProvider returns all methods for that provider", () => {
    reg.registerMethod(validMethod());
    reg.registerMethod(validMethod({ method_id: "test.text.summarize" }));
    const methods = reg.getMethodsForProvider("test-provider");
    expect(methods).toHaveLength(2);
  });

  it("getMethod returns undefined for unknown method", () => {
    expect(reg.getMethod("nonexistent")).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// Default registry (Apple methods)
// -------------------------------------------------------------------------
describe("Default registry -- Apple methods", () => {
  const reg = createDefaultRegistry();

  it("has apple-intelligence-runtime provider", () => {
    const p = reg.getProvider("apple-intelligence-runtime");
    expect(p).toBeDefined();
    expect(p!.provider_class).toBe("sovereign_runtime");
    expect(p!.execution_mode).toBe("local");
    expect(p!.deterministic).toBe(true);
  });

  it("has ollama-local provider", () => {
    const p = reg.getProvider("ollama-local");
    expect(p).toBeDefined();
    expect(p!.provider_class).toBe("local_runtime");
  });

  it("Apple methods are correctly bound to provider", () => {
    const methods = reg.getMethodsForProvider("apple-intelligence-runtime");
    expect(methods).toHaveLength(17);
    for (const m of methods) {
      expect(m.provider_id).toBe("apple-intelligence-runtime");
    }
  });

  it("each Apple method has the correct policy tier", () => {
    const tierMap: Record<string, PolicyTier> = {
      "apple.text.generate": PolicyTier.A,
      "apple.text.summarize": PolicyTier.A,
      "apple.text.extract": PolicyTier.A,
      "apple.writing.rewrite": PolicyTier.B,
      "apple.writing.proofread": PolicyTier.B,
      "apple.writing.summarize": PolicyTier.B,
      "apple.speech_in.transcribe_live": PolicyTier.A,
      "apple.speech_in.transcribe_file": PolicyTier.A,
      "apple.speech_in.transcribe_longform": PolicyTier.A,
      "apple.speech_in.dictation_fallback": PolicyTier.A,
      "apple.speech_out.speak": PolicyTier.A,
      "apple.speech_out.render_audio": PolicyTier.A,
      "apple.vision.ocr": PolicyTier.A,
      "apple.vision.document_extract": PolicyTier.A,
      "apple.image.generate": PolicyTier.C,
      "apple.translation.translate": PolicyTier.A,
      "apple.sound.classify": PolicyTier.A,
    };

    for (const [methodId, expectedTier] of Object.entries(tierMap)) {
      const m = reg.getMethod(methodId);
      expect(m, `method ${methodId} should exist`).toBeDefined();
      expect(m!.policy_tier, `method ${methodId} tier`).toBe(expectedTier);
    }
  });

  it("text subsystem methods are Tier A", () => {
    const textMethods = reg
      .getMethodsForProvider("apple-intelligence-runtime")
      .filter((m) => m.subsystem === "text");
    expect(textMethods).toHaveLength(3);
    for (const m of textMethods) {
      expect(m.policy_tier).toBe(PolicyTier.A);
    }
  });

  it("writing subsystem methods are Tier B", () => {
    const writingMethods = reg
      .getMethodsForProvider("apple-intelligence-runtime")
      .filter((m) => m.subsystem === "writing");
    expect(writingMethods).toHaveLength(3);
    for (const m of writingMethods) {
      expect(m.policy_tier).toBe(PolicyTier.B);
    }
  });

  it("image subsystem method is Tier C", () => {
    const imageMethods = reg
      .getMethodsForProvider("apple-intelligence-runtime")
      .filter((m) => m.subsystem === "image");
    expect(imageMethods).toHaveLength(1);
    expect(imageMethods[0].policy_tier).toBe(PolicyTier.C);
  });
});
