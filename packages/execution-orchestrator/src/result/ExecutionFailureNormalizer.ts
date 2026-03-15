export interface NormalizedExecutionFailure {
  code: string;
  message: string;
  providerId: string | null;
  retryable: boolean;
  timestamp: Date;
}

export function normalizeExecutionFailure(
  error: unknown,
  providerId?: string
): NormalizedExecutionFailure {
  if (error instanceof Error) {
    return {
      code: (error as Error & { code?: string }).code ?? 'UNKNOWN',
      message: error.message,
      providerId: providerId ?? null,
      retryable: (error as Error & { retryable?: boolean }).retryable ?? false,
      timestamp: new Date(),
    };
  }
  return {
    code: 'UNKNOWN',
    message: String(error),
    providerId: providerId ?? null,
    retryable: false,
    timestamp: new Date(),
  };
}
