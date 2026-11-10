
import { z } from 'zod';

const passwordComplexityRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export const registerSchema = z
  .object({
    fullName: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Full name is required' : undefined,
      })
      .trim()
      .min(2, 'Name must be at least 2 characters'),

    email: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Email is required' : undefined,
      })
      .email('Invalid email address')
      .toLowerCase()
      .trim(),

    password: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Password is required' : undefined,
      })
      .min(8, 'Password must be at least 8 characters long')
      .max(100, 'Password is too long')
      .regex(
        passwordComplexityRegex,
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ),
  })
  .strict();

export const loginSchema = z.object({
  email: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Email is required' : undefined,
    })
    .email('Invalid email address')
    .toLowerCase()
    .trim(),

  password: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'Password is required' : undefined,
    })
    .min(1, 'Password cannot be empty'),
});
