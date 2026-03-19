/**
 * Schema Validator — validates method output against expected schema.
 *
 * Checks required keys exist and types match expected shapes.
 */
import type { GritsValidationResult, GritsSignal } from "./validation-types.js";

export interface SchemaExpectation {
  readonly required_keys?: readonly string[];
  readonly type_checks?: Record<string, string>;
}

/**
 * Validate output against a schema expectation.
 */
export function validateSchema(
  output: unknown,
  expectation: SchemaExpectation,
  testId: string,
): GritsValidationResult {
  const now = new Date().toISOString();

  if (output === null || output === undefined) {
    return {
      test_id: testId,
      passed: false,
      severity: "critical",
      category: "schema",
      details: "Output is null or undefined",
      timestamp: now,
    };
  }

  if (typeof output !== "object" || Array.isArray(output)) {
    // If it's a primitive, check if that's acceptable (no required keys)
    if (!expectation.required_keys || expectation.required_keys.length === 0) {
      return {
        test_id: testId,
        passed: true,
        severity: "low",
        category: "schema",
        details: "Primitive output accepted (no required keys)",
        timestamp: now,
      };
    }
    return {
      test_id: testId,
      passed: false,
      severity: "critical",
      category: "schema",
      details: `Expected object with keys, got ${typeof output}`,
      timestamp: now,
    };
  }

  const obj = output as Record<string, unknown>;
  const missingKeys: string[] = [];

  if (expectation.required_keys) {
    for (const key of expectation.required_keys) {
      if (!(key in obj)) {
        missingKeys.push(key);
      }
    }
  }

  if (missingKeys.length > 0) {
    return {
      test_id: testId,
      passed: false,
      severity: "high",
      category: "schema",
      details: `Missing required keys: ${missingKeys.join(", ")}`,
      timestamp: now,
    };
  }

  // Type checks
  const typeErrors: string[] = [];
  if (expectation.type_checks) {
    for (const [key, expectedType] of Object.entries(expectation.type_checks)) {
      if (key in obj) {
        const actualType = typeof obj[key];
        if (actualType !== expectedType) {
          typeErrors.push(`${key}: expected ${expectedType}, got ${actualType}`);
        }
      }
    }
  }

  if (typeErrors.length > 0) {
    return {
      test_id: testId,
      passed: false,
      severity: "high",
      category: "schema",
      details: `Type mismatches: ${typeErrors.join("; ")}`,
      timestamp: now,
    };
  }

  return {
    test_id: testId,
    passed: true,
    severity: "low",
    category: "schema",
    details: "Schema validation passed",
    timestamp: now,
  };
}

/**
 * Convert a validation result to a signal.
 */
export function schemaSignal(result: GritsValidationResult): GritsSignal {
  return result.passed ? "pass" : "fail";
}
