import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const sanitizeUrl = (val) => (typeof val === 'string' ? val.trim().replace(/^["']|["']$/g, '') : val);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').transform(sanitizeUrl),
  DIRECT_URL: z.string().optional().transform(sanitizeUrl),
  TEST_DATABASE_URL: z.string().optional().transform(sanitizeUrl),
  TEST_DIRECT_URL: z.string().optional().transform(sanitizeUrl),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters for security'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 mins
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
