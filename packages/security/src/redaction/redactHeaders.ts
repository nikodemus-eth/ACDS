const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'cookie',
  'set-cookie',
  'proxy-authorization',
]);

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
  additionalHeaders: string[] = []
): Record<string, string | string[] | undefined> {
  const keysToRedact = new Set([
    ...SENSITIVE_HEADERS,
    ...additionalHeaders.map((h) => h.toLowerCase()),
  ]);

  const result: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (keysToRedact.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}
