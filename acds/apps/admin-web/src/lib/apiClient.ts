import { mockRequest } from './mockApi';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export interface ApiError {
  status: number;
  message: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const parsed = JSON.parse(body) as { message?: string };
      message = parsed.message ?? body;
    } catch {
      message = body;
    }
    const error: ApiError = { status: response.status, message };
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('acds_token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function buildUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    if (USE_MOCKS) {
      return mockRequest<T>('GET', path, undefined, params);
    }
    const url = buildUrl(path, params);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...authHeaders(),
      },
    });
    return handleResponse<T>(response);
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    if (USE_MOCKS) {
      return mockRequest<T>('POST', path, body);
    }
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    if (USE_MOCKS) {
      return mockRequest<T>('PUT', path, body);
    }
    const response = await fetch(buildUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async patch<T>(path: string, body?: unknown): Promise<T> {
    if (USE_MOCKS) {
      return mockRequest<T>('PATCH', path, body);
    }
    const response = await fetch(buildUrl(path), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async delete<T>(path: string): Promise<T> {
    if (USE_MOCKS) {
      return mockRequest<T>('DELETE', path);
    }
    const response = await fetch(buildUrl(path), {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...authHeaders(),
      },
    });
    return handleResponse<T>(response);
  },
};
