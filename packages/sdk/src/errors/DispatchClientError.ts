/**
 * Error representing a transport-level failure when communicating
 * with the ACDS dispatch API (non-2xx response, network error, timeout, etc.).
 */
export class DispatchClientError extends Error {
  public readonly statusCode: number | undefined;
  public readonly responseBody: string | undefined;

  constructor(
    message: string,
    statusCode?: number,
    responseBody?: string,
  ) {
    super(message);
    this.name = 'DispatchClientError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DispatchClientError.prototype);
  }
}
