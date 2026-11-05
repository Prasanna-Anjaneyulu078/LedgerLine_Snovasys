import { z } from 'zod';

const passwordComplexityRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export const registerSchema = z.object({
  fullName: z.string({ required_error: 'Full name is required' }).trim().min(2, 'Name must be at least 2 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long')
    .regex(
      passwordComplexityRegex,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).default('ACCOUNT_HOLDER').optional(),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password cannot be empty'),
});

