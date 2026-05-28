import { z } from 'zod';

export const StartTrackingSchema = z.object({
  product_id: z.string().uuid(),
  target_price: z.number().positive().optional(),
});

export const UpdateTrackingSchema = z.object({
  target_price: z.number().positive().nullable(),
  is_active: z.boolean().optional(),
});

export type StartTrackingInput = z.infer<typeof StartTrackingSchema>;
export type UpdateTrackingInput = z.infer<typeof UpdateTrackingSchema>;
