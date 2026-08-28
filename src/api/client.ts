import type { ApiError as ApiErrorShape } from './types';

/** API origin: from VITE_API_BASE_URL, falling back to local dev. */
export const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

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

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: jsonBody(body) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * POST a binary payload (e.g. a bank statement file upload) as-is, without
   * JSON-encoding the body. Reuses the same auth header assembly and
   * error/unauthorized handling as the JSON methods above; the only
   * differences are the raw `Blob` body and the `Content-Type` header.
   */
  postBinary<T>(path: string, body: Blob, contentType = 'application/octet-stream'): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body,
      headers: { 'Content-Type': contentType },
    });
  }

  /**
   * POST a `FormData` (multipart/form-data) body, e.g. one or more file parts.
   * The `Content-Type` header (with its multipart boundary) is deliberately left
   * unset so the browser assembles it; see `request` below.
   */
  postForm<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: form });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    // Don't force JSON on a FormData body — the browser must set the multipart
    // boundary itself. Only default the content-type for other (JSON) bodies.
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json');
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
