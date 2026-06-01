import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(8).optional(),
}).refine(d => !d.new_password || !!d.current_password, {
  message: 'current_password is required when changing password',
  path: ['current_password'],
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
