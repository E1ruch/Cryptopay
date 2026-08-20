import { z } from 'zod';
import { MEMBERSHIP_ROLES } from '@cryptopay/shared';
import { emailSchema } from './auth.schemas.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(60).regex(slugPattern, 'Must be lowercase, alphanumeric, hyphen-separated').optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(MEMBERSHIP_ROLES).default('MEMBER'),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
