import { DispatchClientConfig, DEFAULT_TIMEOUT_MS } from './DispatchClientConfig.js';
import { DispatchClientError } from '../errors/DispatchClientError.js';

/**
 * Low-level HTTP transport that wraps the Fetch API.
 * Handles base URL resolution, default headers, timeout via AbortController,
 * and uniform error wrapping.
 */
export class ApiTransport {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(config: DispatchClientConfig) {
    // Strip trailing slash so path concatenation is predictable
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');

    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;

    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.headers,
    };

    if (config.authToken) {
      this.defaultHeaders['Authorization'] = `Bearer ${config.authToken}`;
    }
  }

  // ── Public convenience methods ──────────────────────────────────────

  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, headers);
  }

  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', path, body, headers);
  }

  async put<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', path, body, headers);
  }

  async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', path, undefined, headers);
  }

  // ── Core request implementation ─────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: { ...this.defaultHeaders, ...extraHeaders },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();

      if (!response.ok) {
        throw new DispatchClientError(
          `HTTP ${response.status} ${response.statusText} – ${method} ${path}`,
          response.status,
          text,
        );
      }

      // Return parsed JSON when the response has a body; otherwise return
      // an empty object cast to T (useful for 204-style responses).
      if (text.length === 0) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (error: unknown) {
      if (error instanceof DispatchClientError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DispatchClientError(
          `Request timed out after ${this.timeoutMs}ms – ${method} ${path}`,
        );
      }

      const msg = error instanceof Error ? error.message : String(error);
      throw new DispatchClientError(`Network error – ${method} ${path}: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
