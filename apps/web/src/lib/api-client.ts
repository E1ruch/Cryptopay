export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.request_id;
    this.details = body.error.details;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3010';

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie);
  return match?.[1];
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  organizationId?: string;
}

/**
 * Thin fetch wrapper for the CryptoPay dashboard API: always sends cookies
 * (session auth, spec §31), attaches the CSRF double-submit header on
 * mutating requests (spec §31), and normalizes error responses into
 * ApiError using the standard {error:{code,message,request_id}} shape
 * (spec §55) instead of leaking raw fetch/HTTP details to callers.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};

  // Fastify's JSON body parser rejects an application/json content-type on
  // an empty body (e.g. POST /v1/auth/logout takes no payload) — only set
  // it when there's actually a body to send.
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (method !== 'GET') {
    const csrfToken = readCookie('cp_csrf');
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }
  if (options.organizationId) {
    headers['X-Organization-Id'] = options.organizationId;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error) {
      throw new ApiError(response.status, body);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
