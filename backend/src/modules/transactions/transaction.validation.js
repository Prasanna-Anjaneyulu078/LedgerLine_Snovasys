import { z } from 'zod';

export const depositSchema = z
  .object({
    accountNumber: z
      .string({ invalid_type_error: 'Account number must be a string' })
      .trim()
      .min(1, 'Account number is required')
      .optional(),
    accountId: z.string().uuid('Invalid account ID format').optional(),
    amount: z.union([z.string(), z.number(), z.bigint()], {
      required_error: 'Amount is required',
    }),
    description: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.accountNumber && !data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Account number is required',
        path: ['accountNumber'],
      });
    }
  });

export const withdrawSchema = z
  .object({
    accountNumber: z
      .string({ invalid_type_error: 'Account number must be a string' })
      .trim()
      .min(1, 'Account number is required')
      .optional(),
    accountId: z.string().uuid('Invalid account ID format').optional(),
    amount: z.union([z.string(), z.number(), z.bigint()], {
      required_error: 'Amount is required',
    }),
    description: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.accountNumber && !data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Account number is required',
        path: ['accountNumber'],
      });
    }
  });

export const transferSchema = z
  .object({
    sourceAccountNumber: z
      .string({ invalid_type_error: 'Source account number must be a string' })
      .trim()
      .min(1, 'Source account number is required')
      .optional(),
    destinationAccountNumber: z
      .string({ invalid_type_error: 'Destination account number must be a string' })
      .trim()
      .min(1, 'Destination account number is required')
      .optional(),
    sourceAccountId: z.string().uuid('Invalid source account ID format').optional(),
    destinationAccountId: z.string().uuid('Invalid destination account ID format').optional(),
    amount: z.union([z.string(), z.number(), z.bigint()], {
      required_error: 'Amount is required',
    }),
    description: z.string().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    const hasAccountNumbers = Boolean(data.sourceAccountNumber || data.destinationAccountNumber);
    const hasAccountIds = Boolean(data.sourceAccountId || data.destinationAccountId);

    if (hasAccountNumbers && hasAccountIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either account numbers or account IDs, not both',
        path: ['sourceAccountNumber'],
      });
      return;
    }

    if (!hasAccountNumbers && !hasAccountIds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Source account number is required',
        path: ['sourceAccountNumber'],
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination account number is required',
        path: ['destinationAccountNumber'],
      });
      return;
    }

    if (hasAccountNumbers) {
      if (!data.sourceAccountNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Source account number is required',
          path: ['sourceAccountNumber'],
        });
      }
      if (!data.destinationAccountNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Destination account number is required',
          path: ['destinationAccountNumber'],
        });
      }
      if (
        data.sourceAccountNumber &&
        data.destinationAccountNumber &&
        data.sourceAccountNumber === data.destinationAccountNumber
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Source and destination accounts must be different',
          path: ['destinationAccountNumber'],
        });
      }
    }

    if (hasAccountIds) {
      if (!data.sourceAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Source account ID is required',
          path: ['sourceAccountId'],
        });
      }
      if (!data.destinationAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Destination account ID is required',
          path: ['destinationAccountId'],
        });
      }
      if (
        data.sourceAccountId &&
        data.destinationAccountId &&
        data.sourceAccountId === data.destinationAccountId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Source and destination accounts must be different',
          path: ['destinationAccountId'],
        });
      }
    }
  });

export const transactionIdParamSchema = z.object({
  transactionId: z.string().trim().min(1, 'Transaction identifier is required'),
});

export const transactionQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(15).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  accountId: z.string().uuid().optional(),
  accountNumber: z.string().trim().optional(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUSED']).optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().trim().optional(),
});

