import { z } from "zod";

import { parseEgressProxyUrl } from "./egress-proxy";
import { loadRepoEnv } from "./load";
import type { EnvFieldMeta } from "./meta";
import {
  MIN_SECRET_LENGTH,
  secretString,
  VAULT_ROTATION_NOTE,
} from "./secrets";

loadRepoEnv();

const DEFAULT_AUTH_URL = "http://127.0.0.1:3000";

const trimmedUrl = z.string().trim().pipe(z.url());
const trimmedMin1 = z.string().trim().min(1);

/**
 * Shared Zod field groups: compose per entrypoint `createEnv`. Every field ends
 * in `.meta({ description, sensitive, usedBy })` (see `./meta`); the metadata
 * feeds `env.example` and `docs/reference/platform/configuration.md`, and the
 * parsed types do not change.
 */

const meta = (value: EnvFieldMeta): EnvFieldMeta => value;

export const databaseFields = {
  DATABASE_URL: trimmedUrl.meta(
    meta({
      description:
        "Postgres connection URL of the application role. The password in it is a secret.",
      sensitive: true,
      usedBy: ["web", "worker", "migrate"],
    })
  ),
  DATABASE_URL_MIGRATE: trimmedUrl.optional().meta(
    meta({
      description:
        "Connection URL migrations use, for a role that may create schemas and tables. Falls back to DATABASE_URL.",
      sensitive: true,
      usedBy: ["migrate"],
    })
  ),
};

export const authFields = {
  BETTER_AUTH_SECRET: secretString("BETTER_AUTH_SECRET", {
    minLength: MIN_SECRET_LENGTH,
  }).meta(
    meta({
      description: `Signs sessions and cookies. At least ${MIN_SECRET_LENGTH} characters; known placeholder values are refused. Changing it signs everyone out.`,
      sensitive: true,
      usedBy: ["web"],
    })
  ),
  BETTER_AUTH_URL: trimmedUrl.default(DEFAULT_AUTH_URL).meta(
    meta({
      description:
        "The exact URL users type in the browser, with scheme and no trailing slash. Also the CORS origin of the object-store bucket.",
      sensitive: false,
      usedBy: ["web"],
      example: DEFAULT_AUTH_URL,
    })
  ),
  BETTER_AUTH_ALLOW_SIGNUP: z
    .stringbool()
    .default(false)
    .meta(
      meta({
        description:
          "Open public registration (anyone can sign up and create organizations). Leave 0 and create the first admin with the bootstrap command; restart web after changing it.",
        sensitive: false,
        usedBy: ["web"],
        example: "0",
      })
    ),
  BETTER_AUTH_TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    )
    .meta(
      meta({
        description:
          "Extra origins that may call the app, comma-separated (parsed to a list).",
        sensitive: false,
        usedBy: ["web"],
      })
    ),
};

/** Optional SMTP for organization invitation mail. Copy-link still works without it. */
export const smtpFields = {
  SMTP_HOST: trimmedMin1.optional().meta(
    meta({
      description:
        "SMTP server for invitation mail. Mail is sent only when both SMTP_HOST and SMTP_FROM are set.",
      sensitive: false,
      usedBy: ["web"],
    })
  ),
  SMTP_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .optional()
    .meta(
      meta({
        description:
          "SMTP port. Unset sends on 587 (STARTTLS); 465 uses implicit TLS.",
        sensitive: false,
        usedBy: ["web"],
      })
    ),
  SMTP_USER: trimmedMin1.optional().meta(
    meta({
      description: "SMTP username, when the server requires authentication.",
      sensitive: false,
      usedBy: ["web"],
    })
  ),
  SMTP_PASS: trimmedMin1.optional().meta(
    meta({
      description: "SMTP password, when the server requires authentication.",
      sensitive: true,
      usedBy: ["web"],
    })
  ),
  SMTP_FROM: z
    .string()
    .trim()
    .pipe(z.email())
    .optional()
    .meta(
      meta({
        description: "Sender address of invitation mail (an email address).",
        sensitive: false,
        usedBy: ["web"],
      })
    ),
};

export const s3Fields = {
  S3_ENDPOINT: trimmedUrl.meta(
    meta({
      description:
        "S3-compatible endpoint the server reads and writes Evidence through (SeaweedFS locally). Browsers also upload to it with presigned requests unless S3_PUBLIC_URL is set.",
      sensitive: false,
      usedBy: ["web", "worker"],
      example: "http://127.0.0.1:9100",
    })
  ),
  S3_PUBLIC_URL: trimmedUrl.optional().meta(
    meta({
      description:
        "URL browsers use for presigned Evidence uploads and downloads, when it differs from S3_ENDPOINT (a public HTTPS name for an internal store). Unset presigns against S3_ENDPOINT.",
      sensitive: false,
      usedBy: ["web"],
    })
  ),
  S3_ACCESS_KEY: trimmedMin1.meta(
    meta({
      description: "Access key id of the object store.",
      sensitive: false,
      usedBy: ["web", "worker"],
      example: "watchdog",
    })
  ),
  S3_SECRET_KEY: secretString("S3_SECRET_KEY", { rejectDevDefault: true }).meta(
    meta({
      description:
        "Secret key of the object store. The development default is refused when NODE_ENV is production.",
      sensitive: true,
      usedBy: ["web", "worker"],
    })
  ),
  S3_BUCKET: trimmedMin1.meta(
    meta({
      description: "Evidence bucket name.",
      sensitive: false,
      usedBy: ["web", "worker"],
      example: "watchdog-evidence",
    })
  ),
  S3_REGION: trimmedMin1.default("us-east-1").meta(
    meta({
      description: "Region used to sign object-store requests.",
      sensitive: false,
      usedBy: ["web", "worker"],
    })
  ),
};

/**
 * At least `MIN_SECRET_LENGTH` characters and not a placeholder. Base64/hex/HKDF
 * normalize lives in vault.ts.
 */
export const vaultFields = {
  WD_MASTER_VAULT_KEY: secretString("WD_MASTER_VAULT_KEY", {
    minLength: MIN_SECRET_LENGTH,
    note: VAULT_ROTATION_NOTE,
  }).meta(
    meta({
      description: `Master key that encrypts stored Cap credentials. At least ${MIN_SECRET_LENGTH} characters (base64 or hex of 32 bytes recommended); known placeholders are refused. Back it up: without it stored credentials cannot be read, and changing it makes them unreadable unless you rotate it with just vault-rekey (node vault-rekey.mjs in the container).`,
      sensitive: true,
      usedBy: ["web", "worker"],
    })
  ),
};

const exportFields = {
  WD_EXPORT_DIR: trimmedMin1.optional().meta(
    meta({
      description:
        "Folder of the Case Export shadow. Unset uses <repo>/export (the image uses /data/export).",
      sensitive: false,
      usedBy: ["web", "worker"],
    })
  ),
};

/**
 * Optional egress proxy for every Cap request (`@watchdog/tools/http` reads the
 * same `WD_EGRESS_PROXY` from the process environment). An http(s) URL; the
 * proxy then resolves and connects, so see docs/reference/platform/caps-boundary.md
 * for the checks that still run in Watchdog.
 */
export const egressFields = {
  WD_EGRESS_PROXY: trimmedUrl
    .refine((value) => parseEgressProxyUrl(value) !== null, {
      message: "WD_EGRESS_PROXY must be an http or https URL",
    })
    .optional()
    .meta(
      meta({
        description:
          "http(s) proxy for every Cap and tool request; credentials may be embedded, so treat it as a secret. Unset connects directly. See docs/reference/platform/caps-boundary.md.",
        sensitive: true,
        usedBy: ["web", "worker"],
      })
    ),
};

const nodeEnvFields = {
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development")
    .meta(
      meta({
        description:
          "Runtime mode. The container images set production; production also refuses the development object-store secret.",
        sensitive: false,
        usedBy: ["web", "worker"],
      })
    ),
};

/** Every field `@watchdog/env/server` validates. */
export const allEnvFields = {
  ...databaseFields,
  ...authFields,
  ...smtpFields,
  ...s3Fields,
  ...vaultFields,
  ...exportFields,
  ...egressFields,
  ...nodeEnvFields,
};

/** The groups above in reference order, for the generated docs. */
export const envGroups = [
  { title: "Database", fields: databaseFields },
  { title: "Authentication", fields: authFields },
  { title: "Email (SMTP)", fields: smtpFields },
  { title: "Object storage", fields: s3Fields },
  { title: "Vault", fields: vaultFields },
  { title: "Case Export", fields: exportFields },
  { title: "Outbound egress", fields: egressFields },
  { title: "Runtime", fields: nodeEnvFields },
] as const;

/** Common `createEnv` options (not the Zod schema). */
export const createEnvOptions = {
  runtimeEnv: process.env,
  emptyStringAsUndefined: true as const,
  isServer: typeof window === "undefined",
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
};
