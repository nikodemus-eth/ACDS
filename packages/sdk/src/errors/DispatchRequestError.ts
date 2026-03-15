/**
 * Error representing a request construction or validation failure.
 * Thrown when a builder detects invalid or incomplete input before
 * any network call is made.
 */
export class DispatchRequestError extends Error {
  public readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[] = []) {
    super(message);
    this.name = 'DispatchRequestError';
    this.validationErrors = validationErrors;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, DispatchRequestError.prototype);
  }
}
