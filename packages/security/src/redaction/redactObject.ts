const SENSITIVE_KEYS = new Set([
  'password', 'secret', 'token', 'apiKey', 'api_key',
  'authorization', 'credential', 'ciphertext', 'plaintext',
  'keyBuffer', 'masterKey', 'master_key', 'privateKey', 'private_key',
]);

export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  additionalKeys: string[] = []
): Record<string, unknown> {
  const keysToRedact = new Set([...SENSITIVE_KEYS, ...additionalKeys]);
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (keysToRedact.has(key)) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, additionalKeys);
    } else {
      result[key] = value;
    }
  }

  return result;
}
