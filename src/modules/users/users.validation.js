import { z } from 'zod';

export const balanceOperationSchema = z.object({
  body: z.object({
    amount: z.number().positive('Amount must be positive'),
    note: z.string().optional(),
  }),
});
