import { z } from 'zod';

export const depositSchema = z.object({
  accountId: z.string().uuid('Invalid account ID format'),
  amount: z.union([z.string(), z.number(), z.bigint()], {
    required_error: 'Amount is required',
  }),
  description: z.string().max(255).optional(),
});

export const withdrawSchema = z.object({
  accountId: z.string().uuid('Invalid account ID format'),
  amount: z.union([z.string(), z.number(), z.bigint()], {
    required_error: 'Amount is required',
  }),
  description: z.string().max(255).optional(),
});

export const transferSchema = z
  .object({
    sourceAccountId: z.string().uuid('Invalid source account ID format'),
    destinationAccountId: z.string().uuid('Invalid destination account ID format'),
    amount: z.union([z.string(), z.number(), z.bigint()], {
      required_error: 'Amount is required',
    }),
    description: z.string().max(255).optional(),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: 'Source and destination accounts must be different',
    path: ['destinationAccountId'],
  });

export const transactionIdParamSchema = z.object({
  transactionId: z.string().uuid('Invalid transaction ID format'),
});

export const transactionQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  accountId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUSED']).optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

