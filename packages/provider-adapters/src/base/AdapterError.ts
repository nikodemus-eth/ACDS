export class AdapterError extends Error {
  public readonly code: string;
  public readonly providerId?: string;
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(options: {
    message: string;
    code: string;
    providerId?: string;
    statusCode?: number;
    retryable?: boolean;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AdapterError';
    this.code = options.code;
    this.providerId = options.providerId;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
  }
}
