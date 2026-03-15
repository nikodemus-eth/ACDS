const REDACTED = '[REDACTED]';
const SECRET_PATTERNS = [
  /key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /cipher/i,
  /ciphertext/i,
];

export class SecretRedactor {
  private readonly sensitiveKeys: RegExp[];

  constructor(additionalPatterns: RegExp[] = []) {
    this.sensitiveKeys = [...SECRET_PATTERNS, ...additionalPatterns];
  }

  isSensitiveKey(key: string): boolean {
    return this.sensitiveKeys.some((pattern) => pattern.test(key));
  }

  redactValue(key: string, value: unknown): unknown {
    if (this.isSensitiveKey(key)) {
      return REDACTED;
    }
    return value;
  }

  redactRecord(record: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = this.redactValue(key, value);
    }
    return result;
  }
}
