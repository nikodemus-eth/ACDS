export function redactError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const message = error.message
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/https?:\/\/[^:]+:[^@]+@/gi, 'https://[REDACTED]:[REDACTED]@')
      .replace(/["'](?:key|secret|token|password|apiKey|api_key)["']\s*:\s*["'][^"']*["']/gi, '"[FIELD]": "[REDACTED]"');

    return {
      message,
      code: (error as Error & { code?: string }).code,
    };
  }

  return { message: 'An unknown error occurred' };
}
