import { describe, it, expect } from "vitest";
import {
  providerSourceDefaults,
  capabilitySourceDefaults,
  sessionSourceDefaults,
  type Source,
  type ProviderSource,
  type CapabilitySource,
  type SessionSource,
} from "../../src/domain/source-types.js";
import { PolicyTier, compareTiers, isSovereignDefault } from "../../src/domain/policy-tiers.js";
import { ReasonCode, AcdsError } from "../../src/domain/errors.js";
import type { MethodDefinition } from "../../src/domain/method-registry.js";

// -------------------------------------------------------------------------
// Source type defaults
// -------------------------------------------------------------------------
describe("ProviderSource defaults", () => {
  const src = providerSourceDefaults();

  it("has source_class 'provider'", () => {
    expect(src.source_class).toBe("provider");
  });

  it("is deterministic by default", () => {
    expect(src.deterministic).toBe(true);
  });

  it("is routable by default", () => {
    expect(src.routable).toBe(true);
  });

  it("is health-checkable by default", () => {
    expect(src.health_checkable).toBe(true);
  });

  it("is locally controlled by default", () => {
    expect(src.locally_controlled).toBe(true);
  });
});

describe("CapabilitySource defaults", () => {
  const src = capabilitySourceDefaults();

  it("has source_class 'capability'", () => {
    expect(src.source_class).toBe("capability");
  });

  it("requires explicit invocation", () => {
    expect(src.explicit_invocation).toBe(true);
  });

  it("is externally governed", () => {
    expect(src.externally_governed).toBe(true);
  });

  it("is non-deterministic", () => {
    expect(src.non_deterministic).toBe(true);
  });
});

describe("SessionSource defaults", () => {
  const src = sessionSourceDefaults();

  it("has source_class 'session'", () => {
    expect(src.source_class).toBe("session");
  });

  it("is user-bound", () => {
    expect(src.user_bound).toBe(true);
  });

  it("is high-risk", () => {
    expect(src.high_risk).toBe(true);
  });

  it("risk is NOT acknowledged by default", () => {
    expect(src.risk_acknowledged).toBe(false);
  });
});

// -------------------------------------------------------------------------
// Discriminated union distinguishability
// -------------------------------------------------------------------------
describe("Source discriminated union", () => {
  it("can distinguish provider from capability and session via source_class", () => {
    const sources: Source[] = [
      providerSourceDefaults(),
      capabilitySourceDefaults(),
      sessionSourceDefaults(),
    ];

    const classes = sources.map((s) => s.source_class);
    expect(classes).toEqual(["provider", "capability", "session"]);

    // Each class is unique
    expect(new Set(classes).size).toBe(3);
  });

  it("narrows types correctly via switch", () => {
    const src: Source = providerSourceDefaults();
    switch (src.source_class) {
      case "provider":
        // TypeScript narrows to ProviderSource here
        expect(src.deterministic).toBe(true);
        break;
      case "capability":
        // Would be CapabilitySource
        expect(src.explicit_invocation).toBe(true);
        break;
      case "session":
        // Would be SessionSource
        expect(src.user_bound).toBe(true);
        break;
    }
  });
});

// -------------------------------------------------------------------------
// MethodDefinition required fields
// -------------------------------------------------------------------------
describe("MethodDefinition", () => {
  it("validates all required fields are present in a well-formed definition", () => {
    const method: MethodDefinition = {
      method_id: "test.method",
      provider_id: "test-provider",
      subsystem: "text",
      deterministic: true,
      requires_network: false,
      policy_tier: PolicyTier.A,
      input_schema: { type: "object" },
      output_schema: { type: "object" },
    };

    expect(method.method_id).toBe("test.method");
    expect(method.provider_id).toBe("test-provider");
    expect(method.subsystem).toBe("text");
    expect(method.deterministic).toBe(true);
    expect(method.requires_network).toBe(false);
    expect(method.policy_tier).toBe(PolicyTier.A);
    expect(method.input_schema).toEqual({ type: "object" });
    expect(method.output_schema).toEqual({ type: "object" });
  });
});

// -------------------------------------------------------------------------
// Policy tier ordering
// -------------------------------------------------------------------------
describe("PolicyTier ordering", () => {
  it("A < B < C < D", () => {
    expect(compareTiers(PolicyTier.A, PolicyTier.B)).toBeLessThan(0);
    expect(compareTiers(PolicyTier.B, PolicyTier.C)).toBeLessThan(0);
    expect(compareTiers(PolicyTier.C, PolicyTier.D)).toBeLessThan(0);
  });

  it("equal tiers compare to zero", () => {
    expect(compareTiers(PolicyTier.A, PolicyTier.A)).toBe(0);
    expect(compareTiers(PolicyTier.D, PolicyTier.D)).toBe(0);
  });

  it("A and B are sovereign defaults", () => {
    expect(isSovereignDefault(PolicyTier.A)).toBe(true);
    expect(isSovereignDefault(PolicyTier.B)).toBe(true);
  });

  it("C and D are NOT sovereign defaults", () => {
    expect(isSovereignDefault(PolicyTier.C)).toBe(false);
    expect(isSovereignDefault(PolicyTier.D)).toBe(false);
  });
});

// -------------------------------------------------------------------------
// Error codes uniqueness
// -------------------------------------------------------------------------
describe("ReasonCode", () => {
  it("all codes are unique strings", () => {
    const values = Object.values(ReasonCode);
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe("string");
    }
  });

  it("contains all expected codes", () => {
    expect(ReasonCode.METHOD_UNRESOLVED).toBe("METHOD_UNRESOLVED");
    expect(ReasonCode.METHOD_NOT_AVAILABLE).toBe("METHOD_NOT_AVAILABLE");
    expect(ReasonCode.PROVIDER_UNAVAILABLE).toBe("PROVIDER_UNAVAILABLE");
    expect(ReasonCode.POLICY_BLOCKED).toBe("POLICY_BLOCKED");
    expect(ReasonCode.INVALID_REGISTRATION).toBe("INVALID_REGISTRATION");
    expect(ReasonCode.INVALID_EXECUTION_PLAN).toBe("INVALID_EXECUTION_PLAN");
    expect(ReasonCode.VALIDATION_FAILED).toBe("VALIDATION_FAILED");
    expect(ReasonCode.CROSS_CLASS_FALLBACK_BLOCKED).toBe("CROSS_CLASS_FALLBACK_BLOCKED");
    expect(ReasonCode.SESSION_RISK_UNACKNOWLEDGED).toBe("SESSION_RISK_UNACKNOWLEDGED");
  });

  it("AcdsError carries a reason code", () => {
    const err = new AcdsError(ReasonCode.POLICY_BLOCKED, "test");
    expect(err.reason).toBe("POLICY_BLOCKED");
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });
});
