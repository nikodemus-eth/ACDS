/**
 * Pure redaction function — strips sensitive material from any object.
 *
 * Returns a new object (immutable, no mutation of input).
 */

const SENSITIVE_FIELD_NAMES = new Set([
  "token",
  "secret",
  "password",
  "api_key",
  "authorization",
  "credential",
]);

const LONG_SECRET_PATTERN = /[A-Za-z0-9_-]{20,}$/;
const BEARER_BASIC_PATTERN = /^(Bearer |Basic )/i;

/**
 * Redact sensitive values from an object tree.
 * Returns a deep copy with sensitive values replaced by `[REDACTED]`.
 */
export function redact<T>(input: T): T {
  return redactValue(input, "") as T;
}

function redactValue(value: unknown, fieldName: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value, fieldName);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, fieldName));
  }

  if (typeof value === "object") {
    return redactObject(value as Record<string, unknown>);
  }

  return value;
}

function redactString(value: string, fieldName: string): string {
  const normalizedField = fieldName.toLowerCase();

  // Check if the field name is a known sensitive field
  if (SENSITIVE_FIELD_NAMES.has(normalizedField)) {
    if (LONG_SECRET_PATTERN.test(value)) {
      return "[REDACTED]";
    }
  }

  // Check for Bearer/Basic prefix regardless of field name
  if (BEARER_BASIC_PATTERN.test(value)) {
    return "[REDACTED]";
  }

  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[key] = redactValue(obj[key], key);
  }
  return result;
}
