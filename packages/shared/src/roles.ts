/** Roles within a merchant Organization (spec §63/§96 — team accounts). */
export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Internal admin panel roles — fully separate from merchant roles (spec §32). */
export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'SECURITY', 'READ_ONLY'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** API key scopes (spec §75). Default keys should request least privilege. */
export const API_KEY_SCOPES = [
  'invoices:read',
  'invoices:write',
  'payments:read',
  'payment_links:read',
  'payment_links:write',
  'webhooks:read',
  'webhooks:write',
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const ORGANIZATION_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING_REVIEW', 'CLOSED'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const API_KEY_ENVIRONMENTS = ['test', 'live'] as const;
export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number];
