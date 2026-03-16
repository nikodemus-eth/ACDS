import { REDACTED, SENSITIVE_TOKENS, tokenizeKey, redactInlineSecrets } from '../redaction/sharedRedaction.js';

function redactUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactInlineSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknown(entry));
  }

  if (value !== null && typeof value === 'object') {
    return new SecretRedactor().redactRecord(value as Record<string, unknown>);
  }

  return value;
}

export class SecretRedactor {
  constructor(private readonly additionalSensitiveTokens: string[] = []) {}

  isSensitiveKey(key: string): boolean {
    const tokens = tokenizeKey(key);
    const sensitiveTokens = new Set([
      ...SENSITIVE_TOKENS,
      ...this.additionalSensitiveTokens.map((token) => token.toLowerCase()),
    ]);
    return tokens.some((token) => sensitiveTokens.has(token));
  }

  redactValue(key: string, value: unknown): unknown {
    if (this.isSensitiveKey(key)) {
      return REDACTED;
    }
    return redactUnknown(value);
  }

  redactRecord(record: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (this.isSensitiveKey(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactUnknown(value);
      }
    }
    return result;
  }
}
