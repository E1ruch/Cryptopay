'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function useOrganization() {
  return useQuery({
    queryKey: ['organization', 'me'],
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
