/**
 * Configuration for the ACDS DispatchClient.
 */
export interface DispatchClientConfig {
  /** Base URL of the ACDS dispatch API (e.g. "https://acds.example.com/api"). */
  baseUrl: string;

  /** Optional bearer token for authenticated requests. */
  authToken?: string;

  /** Request timeout in milliseconds. Defaults to 30 000. */
  timeout?: number;

  /** Additional headers to include on every request. */
  headers?: Record<string, string>;
}

/** Default timeout applied when none is specified in config. */
export const DEFAULT_TIMEOUT_MS = 30_000;
