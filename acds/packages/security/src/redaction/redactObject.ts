import { REDACTED, SENSITIVE_TOKENS, tokenizeKey, redactInlineSecrets } from './sharedRedaction.js';

function redactValue(value: unknown, additionalKeys: string[]): unknown {
  if (typeof value === 'string') {
    return redactInlineSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, additionalKeys));
  }

  if (value !== null && typeof value === 'object') {
    return redactObject(value as Record<string, unknown>, additionalKeys);
  }

  return value;
}

export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  additionalKeys: string[] = []
): Record<string, unknown> {
  const keysToRedact = new Set([
    ...SENSITIVE_TOKENS,
    ...additionalKeys.map((key) => key.toLowerCase()),
  ]);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const tokens = tokenizeKey(key);
    if (tokens.some((token) => keysToRedact.has(token))) {
      result[key] = REDACTED;
    } else {
      result[key] = redactValue(value, additionalKeys);
    }
  }

  return result;
}
