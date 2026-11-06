import { z } from 'zod';

export const createAccountSchema = z.object({
  accountType: z.enum(['SAVINGS', 'CHECKING', 'OPERATIONAL']).default('SAVINGS').optional(),
  currency: z.string().length(3).default('INR').optional(),
});

export const accountIdParamSchema = z
  .object({
    accountId: z.string().trim().min(1, 'Account identifier is required').optional(),
    accountNumber: z.string().trim().min(1, 'Account identifier is required').optional(),
  })
  .refine((data) => Boolean(data.accountId || data.accountNumber), {
    message: 'Account identifier is required',
  });

export const statementQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

