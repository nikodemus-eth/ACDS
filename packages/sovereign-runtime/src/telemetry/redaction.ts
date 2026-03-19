/**
 * Log redaction layer.
 * Wraps @acds/security redaction with runtime-specific patterns.
 */

/** Patterns that look like secrets/tokens. */
const TOKEN_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,       // OpenAI-style keys
  /\b(Bearer\s+[a-zA-Z0-9\-._~+/]+=*)\b/g, // Bearer tokens
  /\b(ghp_[a-zA-Z0-9]{36,})\b/g,     // GitHub personal access tokens
  /\b(gho_[a-zA-Z0-9]{36,})\b/g,     // GitHub OAuth tokens
  /\b(xox[bpsa]-[a-zA-Z0-9\-]+)\b/g, // Slack tokens
  /\b(eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_.+/=]*)\b/g, // JWT tokens
];

const REDACTED = '[REDACTED]';

/** Known sensitive field names. */
const SENSITIVE_FIELDS = new Set([
  'apikey', 'api_key', 'apiKey',
  'secret', 'token', 'password',
  'authorization', 'auth',
  'credential', 'credentials',
  'private_key', 'privateKey',
]);

/**
 * Redact sensitive values from a structured log object.
 */
export function redactLogEvent<T extends Record<string, unknown>>(event: T): T {
  const result = {} as Record<string, unknown>;

  for (const [key, value] of Object.entries(event)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = REDACTED;
    } else if (typeof value === 'string') {
      result[key] = redactTokensInString(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactLogEvent(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Redact token-like patterns from a string.
 */
export function redactTokensInString(text: string): string {
  let result = text;
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), REDACTED);
  }
  return result;
}
