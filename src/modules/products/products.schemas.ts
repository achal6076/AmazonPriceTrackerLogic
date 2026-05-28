import { z } from 'zod';

export const AddProductSchema = z.object({
  asin: z.string().regex(/^[A-Z0-9]{10}$/, 'ASIN must be 10 alphanumeric characters'),
  url: z.string().url(),
  title: z.string().optional(),
  image_url: z.string().url().optional(),
  retailer: z.string().default('amazon'),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const HistoryQuerySchema = PaginationSchema.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type AddProductInput = z.infer<typeof AddProductSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type HistoryQueryInput = z.infer<typeof HistoryQuerySchema>;
