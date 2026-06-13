import { z } from 'zod';

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(255).optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;
