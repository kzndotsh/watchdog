import { z } from "zod";

import { loadRepoEnv } from "./load";

loadRepoEnv();

const DEFAULT_AUTH_URL = "http://127.0.0.1:3000";

/** Shared Zod field groups — compose per entrypoint `createEnv`. */

export const databaseFields = {
  DATABASE_URL: z.url(),
  DATABASE_URL_MIGRATE: z.url().optional(),
};

export const authFields = {
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default(DEFAULT_AUTH_URL),
  BETTER_AUTH_ALLOW_SIGNUP: z.stringbool().default(false),
  BETTER_AUTH_TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    ),
};

/** Optional SMTP for organization invitation mail. Copy-link still works without it. */
export const smtpFields = {
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.email().optional(),
};

export const s3Fields = {
  S3_ENDPOINT: z.url(),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1).default("us-east-1"),
};

/** Non-empty only — base64/hex/HKDF normalize lives in vault.ts. */
export const vaultFields = {
  WD_MASTER_VAULT_KEY: z.string().min(1),
};

export const exportFields = {
  WD_EXPORT_DIR: z.string().min(1).optional(),
};

export const nodeEnvFields = {
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
};

/** Common `createEnv` options (not the Zod schema). */
export const createEnvOptions = {
  runtimeEnv: process.env,
  emptyStringAsUndefined: true as const,
  isServer: typeof window === "undefined",
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
};
