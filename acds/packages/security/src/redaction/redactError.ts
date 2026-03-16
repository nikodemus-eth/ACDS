import { redactInlineSecrets } from './sharedRedaction.js';

export function redactError(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    return {
      message: redactInlineSecrets(error.message),
      code: (error as Error & { code?: string }).code,
    };
  }

  return { message: 'An unknown error occurred' };
}
