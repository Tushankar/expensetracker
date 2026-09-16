import { z } from 'zod';

/**
 * Only the upper bound is a hard rule. A minimum of eight with no composition
 * requirement is current NIST guidance: forcing a symbol reliably produces
 * "Password1!", while length is what actually costs an attacker anything. The
 * ceiling exists because bcrypt silently truncates past 72 bytes, and a password
 * whose tail is ignored is worse than one that was rejected.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Enter a valid email address');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  currency: z.string().trim().toUpperCase().length(3).default('INR'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Missing refresh token'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
