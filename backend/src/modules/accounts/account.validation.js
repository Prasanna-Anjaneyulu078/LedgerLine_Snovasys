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

const dateFilterSchema = z.union([
  z.string().datetime({ offset: true }),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD or ISO 8601 datetime)')
    .refine((val) => {
      const parsed = new Date(`${val}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(val);
    }, 'Invalid calendar date'),
]);

export const statementQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).optional(),
  startDate: dateFilterSchema.optional(),
  endDate: dateFilterSchema.optional(),
});

