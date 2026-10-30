import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string().max(50).optional(),
    email: z.string().email('يرجى إدخال بريد إلكتروني صحيح'),
    phone: z
      .string({ required_error: 'يرجى إدخال رقم الهاتف' })
      .trim()
      .min(6, 'يرجى إدخال رقم هاتف صحيح'),
    password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 محارف على الأقل'),
    currency: z.enum(['USD', 'SYP'], {
      required_error: 'يرجى اختيار عملة الحساب (USD أو SYP)',
      invalid_type_error: 'يرجى اختيار عملة الحساب (USD أو SYP)',
    }),
    role: z.enum(['user', 'admin']).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});
