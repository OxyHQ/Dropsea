/**
 * Environment configuration, validated once at import time. Every value that
 * varies between environments comes from here; nothing downstream reads
 * `process.env` directly.
 */

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4300),
  // REQUIRED. No default: a missing DATABASE_URL must fail startup loudly
  // rather than silently pick a database nobody chose.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Bearer tokens are verified by calling this API, and Oxy Files is read
  // through it: no local signing secret, no storage credentials.
  OXY_API_URL: z.string().url().default('https://api.oxy.so'),
  // Comma-separated browser origins allowed besides the *.oxy.so family
  // createOxyCors always allows. Defaults to the web app's own origin,
  // https://dropsea.net, which is not in that family; a value replaces it.
  CORS_ORIGINS: z.string().default('https://dropsea.net'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  oxyApiUrl: env.OXY_API_URL,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
