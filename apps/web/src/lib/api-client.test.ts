import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './api-client.js';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    ...response,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not set a Content-Type header when there is no body', async () => {
    const fetchMock = mockFetchOnce({ status: 204, json: () => Promise.resolve(undefined) });
    await apiFetch('/v1/auth/logout', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('sets Content-Type: application/json when a body is provided', async () => {
    const fetchMock = mockFetchOnce({});
    await apiFetch('/v1/auth/login', { method: 'POST', body: { email: 'a@b.com' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.com' }));
  });

  it('always sends credentials so session cookies are included', async () => {
    const fetchMock = mockFetchOnce({});
    await apiFetch('/v1/organizations/me');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('throws ApiError with the parsed error body on a non-ok response', async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          error: { code: 'forbidden', message: 'nope', request_id: 'req_1' },
        }),
    });

    await expect(apiFetch('/v1/organizations/me')).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'nope',
    });
  });

  it('returns undefined for a 204 No Content response', async () => {
    mockFetchOnce({ status: 204, json: () => Promise.resolve(undefined) });
    await expect(apiFetch('/v1/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('ApiError', () => {
  it('exposes status, code, requestId and details', () => {
    const error = new ApiError(400, {
      error: { code: 'validation_error', message: 'bad input', request_id: 'req_2', details: { field: 'email' } },
    });
    expect(error.status).toBe(400);
    expect(error.code).toBe('validation_error');
    expect(error.requestId).toBe('req_2');
    expect(error.details).toEqual({ field: 'email' });
    expect(error.message).toBe('bad input');
  });
});
