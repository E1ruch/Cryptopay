'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface WebhookEndpointView {
  id: string;
  url: string;
  enabled: boolean;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryView {
  id: string;
  eventType: string;
  attempt: number;
  status: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

const QUERY_KEY = ['dashboard', 'webhook-endpoints'];

export function useWebhookEndpoints() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<WebhookEndpointView[]>('/v1/dashboard/webhook-endpoints'),
  });
}

export function useCreateWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      apiFetch<WebhookEndpointView & { secret: string }>('/v1/dashboard/webhook-endpoints', {
        method: 'POST',
        body: { url },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useRevokeWebhookEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/v1/dashboard/webhook-endpoints/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useWebhookDeliveries(endpointId: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, endpointId, 'deliveries'],
    queryFn: () => apiFetch<WebhookDeliveryView[]>(`/v1/dashboard/webhook-endpoints/${endpointId}/deliveries`),
    enabled: Boolean(endpointId),
  });
}
