import type { ApiError as ApiErrorShape } from './types';

interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = 'ApiError';
    this.status = shape.status;
    this.code = shape.code;
    this.fieldErrors = shape.fieldErrors;
  }
}

export class ApiClient {
  constructor(private readonly opts: ApiClientOptions) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: jsonBody(body) });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: jsonBody(body) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (init.body) headers.set('Content-Type', 'application/json');
    const token = this.opts.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${this.opts.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401) {
      this.opts.onUnauthorized();
    }

    if (!res.ok) {
      const body = await safeReadErrorBody(res);
      throw new ApiError({
        status: res.status,
        message: body.message ?? `HTTP ${res.status}`,
        code: body.code,
        fieldErrors: body.fieldErrors,
      });
    }

    // Servant's `Post '[JSON] NoContent` returns 200 with an empty body, not 204.
    // Treat any empty body as void regardless of status code so void-returning
    // endpoints don't blow up trying to JSON.parse an empty string.
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}

function jsonBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  return JSON.stringify(body);
}

async function safeReadErrorBody(res: Response): Promise<{
  message?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}> {
  try {
    const data = (await res.json()) as {
      message?: string;
      code?: string;
      fieldErrors?: Record<string, string>;
      error?: string;
    };
    return {
      message: data.message ?? data.error,
      code: data.code,
      fieldErrors: data.fieldErrors,
    };
  } catch {
    return {};
  }
}
