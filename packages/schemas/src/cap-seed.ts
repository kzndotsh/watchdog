import { z } from "zod";

import { validateIdentifierValue } from "./validate-identifier";

const HASH_SEED_RE =
  /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$|^[a-fA-F0-9]{128}$/;
const USERNAME_SEED_RE = /^[a-zA-Z0-9_.-]{1,64}$/;
const GITHUB_HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;
const KEYBASE_USERNAME_RE = /^[a-z0-9][a-z0-9_]{0,15}$/i;
const URLHAUS_HASH_RE = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{64}$/;
const OTX_HASH_RE = /^[a-fA-F0-9]+$/;
const OTX_HASH_LENGTHS = new Set([32, 40, 64]);

function failTransform(ctx: z.RefinementCtx, message: string): never {
  ctx.addIssue({ code: "custom", message });
  return z.NEVER;
}

function parseIpOrHostSeed(raw: string): string | null {
  const ip = validateIdentifierValue("ip", raw);
  if (ip.ok) return ip.value;
  if (raw.includes("*")) return null;
  const domain = validateIdentifierValue("domain", raw);
  if (domain.ok) return domain.value;
  return null;
}

function parseBreachQuerySeed(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const email = validateIdentifierValue("email", trimmed);
    if (email.ok) return email.value;
    return USERNAME_SEED_RE.test(trimmed) ? trimmed : null;
  }
  const ipOrHost = parseIpOrHostSeed(trimmed);
  if (ipOrHost !== null) return ipOrHost;
  return USERNAME_SEED_RE.test(trimmed) ? trimmed : null;
}

function parseDehashedQuerySeed(raw: string): string | null {
  const breach = parseBreachQuerySeed(raw);
  if (breach !== null) return breach;
  const trimmed = raw.trim();
  if (/[()"]|\sOR\s|\sAND\s/i.test(trimmed)) return null;
  return trimmed.length > 0 ? trimmed : null;
}

function parseUrlhausQuerySeed(raw: string): string | null {
  const trimmed = raw.trim();
  if (URLHAUS_HASH_RE.test(trimmed)) return trimmed.toLowerCase();
  if (/^https?:\/\//i.test(trimmed)) {
    const url = validateIdentifierValue("url", trimmed);
    return url.ok ? url.value : null;
  }
  return parseIpOrHostSeed(trimmed);
}

function parseIocIndicatorSeed(raw: string): string | null {
  const trimmed = raw.trim();
  if (OTX_HASH_RE.test(trimmed) && OTX_HASH_LENGTHS.has(trimmed.length)) {
    return trimmed.toLowerCase();
  }
  const ip = validateIdentifierValue("ip", trimmed);
  if (ip.ok) return ip.value;
  if (/^https?:\/\//i.test(trimmed)) {
    const url = validateIdentifierValue("url", trimmed);
    if (url.ok) return url.value;
  }
  if (!trimmed.includes("*")) {
    const domain = validateIdentifierValue("domain", trimmed);
    if (domain.ok) return domain.value;
  }
  return null;
}

function parseThreatfoxQuerySeed(raw: string): string | null {
  const trimmed = raw.trim();
  const ipOrHost = parseIpOrHostSeed(trimmed);
  if (ipOrHost !== null) return ipOrHost;
  if (trimmed.length < 2 || trimmed.length > 512) return null;
  return trimmed;
}

function parseKeybaseQuerySeed(raw: string): string | null {
  const trimmed = raw.trim().replace(/^@/, "");
  if (trimmed.includes(".") && !trimmed.includes("@")) {
    const domain = validateIdentifierValue("domain", trimmed);
    if (domain.ok) return domain.value;
  }
  if (KEYBASE_USERNAME_RE.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

function seedStringSchema(
  parse: (raw: string) => string | null,
  message: string
): z.ZodType<string> {
  return z
    .string()
    .trim()
    .min(1)
    .transform((value, ctx) => {
      const parsed = parse(value);
      if (parsed === null) return failTransform(ctx, message);
      return parsed;
    });
}

function identifierSeedSchema(type: "domain" | "ip"): z.ZodType<string> {
  return seedStringSchema(
    (value) => {
      const parsed = validateIdentifierValue(type, value);
      return parsed.ok ? parsed.value : null;
    },
    type === "domain" ? "Invalid domain." : "Invalid IP address."
  );
}

/** Collect Cap host/domain seed — trim, normalize, reject invalid domains. */
export const hostSeedSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !value.includes("*"), {
    message: "Wildcard domains are not valid host seeds.",
  })
  .transform((value, ctx) => {
    const parsed = validateIdentifierValue("domain", value);
    if (!parsed.ok) return failTransform(ctx, parsed.message);
    return parsed.value;
  });

/** Collect Cap IP seed — trim, normalize, reject invalid addresses. */
export const ipSeedSchema = identifierSeedSchema("ip");

/** Collect Cap email seed. */
export const emailSeedSchema = seedStringSchema((value) => {
  const parsed = validateIdentifierValue("email", value);
  return parsed.ok ? parsed.value : null;
}, "Invalid email.");

/** Collect Cap IP or host seed. */
export const ipOrHostSeedSchema = seedStringSchema(
  parseIpOrHostSeed,
  "Invalid IP or host seed."
);

/** Collect Cap file-hash seed (MD5/SHA-1/SHA-256/SHA-512 hex). */
export const hashSeedSchema = seedStringSchema(
  (value) => (HASH_SEED_RE.test(value) ? value.toLowerCase() : null),
  "Invalid file hash seed."
);

/** Breach corpus query seed — email, IP, domain, or username. */
export const breachQuerySeedSchema = seedStringSchema(
  parseBreachQuerySeed,
  "Invalid breach query seed."
);

/** DeHashed query seed — breach shapes plus bounded freeform text. */
export const dehashedQuerySeedSchema = seedStringSchema(
  parseDehashedQuerySeed,
  "Invalid DeHashed query seed."
);

/** URLhaus query seed — hash, http(s) URL, IP, or host. */
export const urlhausQuerySeedSchema = seedStringSchema(
  parseUrlhausQuerySeed,
  "Invalid URLhaus query seed."
);

/** OTX / X-Force style indicator seed — hash, IP, URL, or domain. */
export const iocIndicatorSeedSchema = seedStringSchema(
  parseIocIndicatorSeed,
  "Invalid IOC indicator seed."
);

/** ThreatFox query seed — IP, domain, or IOC string. */
export const threatfoxQuerySeedSchema = seedStringSchema(
  parseThreatfoxQuerySeed,
  "Invalid ThreatFox query seed."
);

/** GitHub handle seed. */
export const githubHandleSeedSchema = seedStringSchema((value) => {
  const handle = value.trim().replace(/^@/, "");
  return GITHUB_HANDLE_RE.test(handle) ? handle.toLowerCase() : null;
}, "Invalid GitHub handle.");

/** Keybase username or domain proof seed. */
export const keybaseQuerySeedSchema = seedStringSchema(
  parseKeybaseQuerySeed,
  "Invalid Keybase query seed."
);

function parsePgpQuerySeed(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const email = validateIdentifierValue("email", trimmed);
    return email.ok ? email.value : null;
  }
  const pgp = validateIdentifierValue("pgp", trimmed);
  return pgp.ok ? pgp.value : null;
}

/** PGP keyserver query seed — email, fingerprint, or key id. */
export const pgpQuerySeedSchema = seedStringSchema(
  parsePgpQuerySeed,
  "Invalid PGP query seed."
);
