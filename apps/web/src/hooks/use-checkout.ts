'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCheckout } from '@/lib/checkout-client';

const ACTIVE_STATUSES = new Set(['PENDING', 'DETECTED', 'CONFIRMING']);

/** Polls only while the invoice can still change state — the server is the
 * source of truth (spec §21/§22), the client just watches it. */
export function useCheckout(invoiceId: string) {
  return useQuery({
    queryKey: ['checkout', invoiceId],
    queryFn: () => fetchCheckout(invoiceId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ACTIVE_STATUSES.has(status) ? 2000 : false;
    },
  });
}
