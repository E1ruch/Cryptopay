import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Argon2id absorbs most of the real security work; this policy only rules
 * out trivially weak passwords (spec §13/§31 — password hashing security).
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(256)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
    message: 'Password must contain at least one letter and one number',
  });

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const verifyTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
});
export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;
