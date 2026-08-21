'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface WalletAddressView {
  id: string;
  network: string;
  token: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

const QUERY_KEY = ['dashboard', 'wallet-addresses'];

export function useWalletAddresses() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<WalletAddressView[]>('/v1/dashboard/wallet-addresses'),
  });
}

export function useSetWalletAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { network: string; token: string; address: string }) =>
      apiFetch<WalletAddressView>('/v1/dashboard/wallet-addresses', { method: 'PUT', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
