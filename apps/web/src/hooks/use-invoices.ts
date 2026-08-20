'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export type InvoiceStatus =
  | 'CREATED'
  | 'PENDING'
  | 'DETECTED'
  | 'CONFIRMING'
  | 'PAID'
  | 'UNDERPAID'
  | 'OVERPAID'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface InvoiceListItem {
  id: string;
  status: InvoiceStatus;
  amount: string;
  currency: string;
  token: string;
  network: string;
  checkoutUrl: string;
  createdAt: string;
}

export interface PaginatedInvoices {
  data: InvoiceListItem[];
  page: number;
  limit: number;
  total: number;
}

export function useInvoices(page: number, limit = 20) {
  return useQuery({
    queryKey: ['dashboard', 'invoices', page, limit],
    queryFn: () => apiFetch<PaginatedInvoices>(`/v1/dashboard/invoices?page=${page}&limit=${limit}`),
    placeholderData: (previous) => previous,
  });
}
