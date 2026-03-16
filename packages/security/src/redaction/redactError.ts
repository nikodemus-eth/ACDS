import { redactInlineSecrets } from './sharedRedaction.js';

export function redactError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const message = redactInlineSecrets(error.message)
      .replace(/https?:\/\/[^:]+:[^@]+@/gi, 'https://[REDACTED]:[REDACTED]@')
      .replace(/["'](?:key|secret|token|password|apiKey|api_key)["']\s*:\s*["'][^"']*["']/gi, '"[FIELD]": "[REDACTED]"')
      .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[REDACTED]');

    return {
      message,
      code: (error as Error & { code?: string }).code,
    };
  }

  return { message: 'An unknown error occurred' };
}
