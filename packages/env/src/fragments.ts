import { z } from "zod";

import { loadRepoEnv } from "./load";

loadRepoEnv();

const DEFAULT_AUTH_URL = "http://127.0.0.1:3000";

const trimmedUrl = z.string().trim().pipe(z.url());
const trimmedMin1 = z.string().trim().min(1);

/** Shared Zod field groups — compose per entrypoint `createEnv`. */

export const databaseFields = {
  DATABASE_URL: trimmedUrl,
  DATABASE_URL_MIGRATE: trimmedUrl.optional(),
};

export const authFields = {
  BETTER_AUTH_SECRET: trimmedMin1.min(32),
  BETTER_AUTH_URL: trimmedUrl.default(DEFAULT_AUTH_URL),
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
  SMTP_HOST: trimmedMin1.optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_USER: trimmedMin1.optional(),
  SMTP_PASS: trimmedMin1.optional(),
  SMTP_FROM: z.string().trim().pipe(z.email()).optional(),
};

export const s3Fields = {
  S3_ENDPOINT: trimmedUrl,
  S3_ACCESS_KEY: trimmedMin1,
  S3_SECRET_KEY: trimmedMin1,
  S3_BUCKET: trimmedMin1,
  S3_REGION: trimmedMin1.default("us-east-1"),
};

/** Non-empty only — base64/hex/HKDF normalize lives in vault.ts. */
export const vaultFields = {
  WD_MASTER_VAULT_KEY: trimmedMin1,
};

export const exportFields = {
  WD_EXPORT_DIR: trimmedMin1.optional(),
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
