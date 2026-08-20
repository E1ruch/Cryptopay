'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface ApiKeyView {
  id: string;
  name: string;
  environment: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  environment: 'test' | 'live';
  scopes: string[];
}

const QUERY_KEY = ['dashboard', 'api-keys'];

export function useApiKeys() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: () => apiFetch<ApiKeyView[]>('/v1/api-keys') });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) =>
      apiFetch<ApiKeyView & { rawKey: string }>('/v1/api-keys', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
