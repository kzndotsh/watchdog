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
        "Postgres connection URL of the application role (watchdog_app): data privileges only, no DDL, no ownership. The web app and worker connect with it. The password in it is a secret.",
      sensitive: true,
      usedBy: ["web", "worker", "migrate"],
    })
  ),
  DATABASE_URL_MIGRATE: trimmedUrl.optional().meta(
    meta({
      description:
        "Connection URL of the owner role, which owns the schema: migrations, the first-admin command and vault key rotation run as it. Falls back to DATABASE_URL, which then must own the schema (a single-role setup without the privilege split).",
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
        "Folder of the Case Export shadow. Unset uses the export folder in the repository root (the image uses /data/export).",
      sensitive: false,
      usedBy: ["web", "worker"],
    })
  ),
  WD_EXPORT_INLINE_MAX_MB: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_048_576)
    .default(100)
    .meta(
      meta({
        description:
          "Largest Case export zip, in megabytes of Evidence, that the web app streams straight to the download. A bigger export runs as a Job on the worker, is stored in object storage and shows up in Recent activity when it is ready (the Job's Case page has the download link).",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "100",
      })
    ),
  WD_EXPORT_LINK_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(720)
    .default(24)
    .meta(
      meta({
        description:
          "Hours the download link of a large Case export works after the Job finishes. After that the link answers 410 and the worker deletes the stored archive.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "24",
      })
    ),
  WD_EXPORT_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(32)
    .default(4)
    .meta(
      meta({
        description:
          "How many Evidence files a Case export reads from object storage at once, and how many Graph entities it renders at once. Lower it on a small database or store; memory use is bounded by this times one read buffer.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "4",
      })
    ),
};

/** Longest restore window an operator may configure (ten years): a typo guard, not a policy. */
const MAX_CASE_RETENTION_DAYS = 3650;

const caseRetentionFields = {
  WD_CASE_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CASE_RETENTION_DAYS)
    .default(30)
    .meta(
      meta({
        description:
          "Days a deleted Case stays restorable (owners and admins can restore it from Deleted Cases). After that the worker purges it for good: the Case, its Graph and history and its files are erased and only the deletion record remains. Backups keep a deleted Case until they age out.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "30",
      })
    ),
};

/**
 * Breach Caps (`breach.*`) query breach and leak corpora about people, so they are opt-in:
 * core's availability check, start-job, the worker's preflight and Playbook start all read
 * this setting (`@watchdog/core` `breachCapsEnabled`).
 */
const breachCapFields = {
  WD_ENABLE_BREACH_CAPS: z
    .stringbool()
    .default(false)
    .meta(
      meta({
        description:
          "Enable the breach Caps (HIBP, Hudson Rock, DeHashed, Snusbase), which query breach and leak corpora about people; DeHashed and Snusbase can return recovered plaintext credentials. Off by default: while it is off none of them can be queued or run, the web app shows them disabled and Playbooks that include them cannot start. Turning it on makes you responsible for a lawful basis for the lookups and for each provider's terms; see docs/reference/platform/cap-register.md. Restart web and worker after changing it.",
        sensitive: false,
        usedBy: ["web", "worker"],
        example: "0",
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

/**
 * Optional error reporting (off unless the DSN is set). The same DSN serves the web app, the worker
 * and the browser (which posts to the web app, never to the tracker).
 */
const errorReportingFields = {
  WD_ERROR_REPORTING_DSN: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .meta(
      meta({
        description:
          "Send server, worker and browser errors to a tracker that speaks the Sentry protocol (Sentry, GlitchTip, Bugsink): its DSN, https://<key>@host/<project>. Unset (the default) sends nothing anywhere; a value that is not a valid DSN leaves reporting off and logs one warning at start. Secrets, request bodies, Evidence content and emails are scrubbed before an error leaves. See docs/how-to/self-host.md.",
        sensitive: true,
        usedBy: ["web", "worker"],
      })
    ),
  WD_RELEASE: trimmedMin1.optional().meta(
    meta({
      description:
        "Release or version label attached to error reports and exported logs (for example 1.4.0 or a commit SHA), so a report names the build it came from. Unset omits it.",
      sensitive: false,
      usedBy: ["web", "worker"],
    })
  ),
};

/**
 * Optional log export over OTLP/HTTP (off unless the endpoint is set). Values are checked by
 * `@watchdog/log`, not here: a typo must leave export off with one warning, never stop startup.
 */
const otlpFields = {
  WD_OTLP_ENDPOINT: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .meta(
      meta({
        description:
          "Export logs from the web app and the worker over OTLP/HTTP: the base URL of an OpenTelemetry Collector, Datadog, Grafana Cloud, Honeycomb or SigNoz (Watchdog adds /v1/logs). Unset (the default) sends nothing anywhere; a value that is not an http(s) URL leaves export off and logs one warning at start. Every record is scrubbed first. May embed credentials, so treat it as a secret. See docs/how-to/self-host.md.",
        sensitive: true,
        usedBy: ["web", "worker"],
      })
    ),
  WD_OTLP_HEADERS: z
    .string()
    .trim()
    .max(4096)
    .optional()
    .meta(
      meta({
        description:
          "Headers sent with every OTLP request, as comma-separated name=value pairs (for example x-honeycomb-team=KEY or DD-API-KEY=KEY). Usually the API key. Malformed pairs leave export off with one warning. Ignored while WD_OTLP_ENDPOINT is unset.",
        sensitive: true,
        usedBy: ["web", "worker"],
      })
    ),
  WD_OTLP_RESOURCE_ATTRIBUTES: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .meta(
      meta({
        description:
          "Extra OTLP resource attributes as comma-separated key=value pairs (for example deployment.region=eu,team=osint). service.name, service.version (WD_RELEASE) and deployment.environment are set for you. Malformed pairs leave export off with one warning.",
        sensitive: false,
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
  ...caseRetentionFields,
  ...breachCapFields,
  ...egressFields,
  ...errorReportingFields,
  ...otlpFields,
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
  { title: "Case retention", fields: caseRetentionFields },
  { title: "Breach Caps", fields: breachCapFields },
  { title: "Outbound egress", fields: egressFields },
  { title: "Error reporting", fields: errorReportingFields },
  { title: "Log export (OTLP)", fields: otlpFields },
  { title: "Runtime", fields: nodeEnvFields },
] as const;

/** Common `createEnv` options (not the Zod schema). */
export const createEnvOptions = {
  runtimeEnv: process.env,
  emptyStringAsUndefined: true as const,
  isServer: typeof window === "undefined",
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
};
