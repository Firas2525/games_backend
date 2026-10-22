import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().max(50).optional(),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(6, 'Phone number must be at least 6 digits').optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    currency: z.enum(['USD', 'SYP']).optional().default('USD'),
    role: z.enum(['user', 'admin']).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});
