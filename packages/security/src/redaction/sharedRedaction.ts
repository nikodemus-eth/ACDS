export const REDACTED = '[REDACTED]';

export const SENSITIVE_TOKENS = new Set([
  'api',
  'auth',
  'authorization',
  'cipher',
  'ciphertext',
  'credential',
  'key',
  'master',
  'password',
  'plaintext',
  'private',
  'secret',
  'token',
]);

export function tokenizeKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function redactInlineSecrets(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/Basic\s+\S+/gi, 'Basic [REDACTED]')
    .replace(/\b(?:api[_-]?key|key|secret|token|password)\b\s*[=:]\s*([^\s,&]+)/gi, (_match, captured: string) =>
      _match.replace(captured, REDACTED),
    )
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/https?:\/\/[^:\s]+:[^@\s]+@/gi, 'https://[REDACTED]:[REDACTED]@');
}
