import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Lightweight HTTP server for adapter integration tests.
 * Binds to port 0 (OS-assigned) on 127.0.0.1 — no mocks needed.
 */
export class TestHttpServer {
  private server: Server | null = null;
  private handler: RequestHandler = (_req, res) => {
    res.writeHead(500);
    res.end('No handler configured');
  };

  /** Start the server and return the base URL (e.g. http://127.0.0.1:54321). */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handler(req, res));
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (typeof addr === 'object' && addr) {
          resolve(`http://127.0.0.1:${addr.port}`);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      this.server.on('error', reject);
    });
  }

  /** Set the request handler. Call before each test to configure responses. */
  setHandler(handler: RequestHandler): void {
    this.handler = handler;
  }

  /** Convenience: set a handler that routes by method + path prefix. */
  setRoutes(routes: Record<string, RequestHandler>): void {
    this.handler = (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      for (const [pattern, handler] of Object.entries(routes)) {
        const [method, path] = pattern.includes(' ')
          ? pattern.split(' ', 2)
          : ['*', pattern];
        if ((method === '*' || req.method === method) && url.pathname.startsWith(path)) {
          handler(req, res);
          return;
        }
      }
      res.writeHead(404);
      res.end('Not found');
    };
  }

  /** Close the server. */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Get the port the server is listening on (useful for connection-refused tests). */
  get port(): number {
    const addr = this.server?.address();
    if (typeof addr === 'object' && addr) return addr.port;
    throw new Error('Server not started');
  }
}

/** Read the full request body as a string. */
export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

/** Send a JSON response. */
export function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
