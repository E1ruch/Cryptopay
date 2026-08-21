'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const QUERY_KEY = ['organization', 'me'];

export function useOrganization() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<OrganizationView>('/v1/organizations/me'),
    retry: (failureCount, error) => {
      // 403 (no org yet / not a member) and 401 (not logged in) won't
      // resolve by retrying — only retry on transient/network errors.
      if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<OrganizationView>('/v1/organizations', { method: 'POST', body: { name } }),
    onSuccess: (organization) => void queryClient.setQueryData(QUERY_KEY, organization),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<OrganizationView>('/v1/organizations/me', { method: 'PATCH', body: { name } }),
    onSuccess: (organization) => void queryClient.setQueryData(QUERY_KEY, organization),
  });
}

export interface MembershipView {
  id: string;
  userId: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  createdAt: string;
  user: { id: string; email: string };
}

const MEMBERS_QUERY_KEY = ['organization', 'members'];

export function useOrganizationMembers() {
  return useQuery({
    queryKey: MEMBERS_QUERY_KEY,
    queryFn: () => apiFetch<MembershipView[]>('/v1/organizations/me/members'),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: MembershipView['role'] }) =>
      apiFetch<MembershipView>('/v1/organizations/me/members', { method: 'POST', body: input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY }),
  });
}
