export function redactError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const message = error.message
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');

    return {
      message,
      code: (error as Error & { code?: string }).code,
    };
  }

  return { message: 'An unknown error occurred' };
}
