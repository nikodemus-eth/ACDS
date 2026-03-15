export class ProviderExecutionError extends Error {
  public readonly code: string;
  public readonly providerId?: string;
  public readonly retryable: boolean;

  constructor(options: {
    message: string;
    code: string;
    providerId?: string;
    retryable?: boolean;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ProviderExecutionError';
    this.code = options.code;
    this.providerId = options.providerId;
    this.retryable = options.retryable ?? false;
  }
}
