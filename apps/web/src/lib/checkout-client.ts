export interface CheckoutView {
  id: string;
  status: string;
  merchantName: string;
  description: string | null;
  amount: string;
  currency: string;
  token: string;
  network: string;
  paymentAddress: string;
  expiresAt: string;
  successUrl: string | null;
  cancelUrl: string | null;
}

export interface CheckoutApiErrorBody {
  error: { code: string; message: string; request_id: string; details?: unknown };
}

export class CheckoutApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: CheckoutApiErrorBody) {
    super(body.error.message);
    this.name = 'CheckoutApiError';
    this.status = status;
    this.code = body.error.code;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3010';

/**
 * The public checkout endpoints (spec §19) take no API key and no session
 * cookie — unlike apiFetch, there's no CSRF header or credentials to send.
 */
async function checkoutFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as CheckoutApiErrorBody | null;
    if (body?.error) {
      throw new CheckoutApiError(response.status, body);
    }
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchCheckout(invoiceId: string): Promise<CheckoutView> {
  return checkoutFetch<CheckoutView>(`/v1/checkout/${invoiceId}`);
}

export function simulateCheckoutPayment(invoiceId: string, amount?: string): Promise<CheckoutView> {
  return checkoutFetch<CheckoutView>(`/v1/checkout/${invoiceId}/simulate-payment`, {
    method: 'POST',
    body: JSON.stringify(amount ? { amount } : {}),
  });
}
