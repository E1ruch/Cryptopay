import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@cryptopay/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: MembershipRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
