import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-catch";
import { ValidationVendorError, type ToolsTag } from "../errors/tagged-errors";
import { parseVendorError } from "../errors/vendor-errors";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { nowIsoStringEffect } from "../infra/clock";
import { normalizeEmail } from "../normalize";
import {
  asBool,
  asNumber,
  asString,
  isRecord,
  recordRows,
} from "../parse/coerce";

/** Upper bounds on what one snapshot keeps; a longer list is cut and flagged `isTruncated`. */
export const EMAILOSINT_MAX_ACCOUNTS = 200;
export const EMAILOSINT_MAX_SITES = 500;
export const EMAILOSINT_MAX_BREACH_SOURCES = 100;
export const EMAILOSINT_MAX_STEALER_HOSTS = 50;
/** Per-module timeout sent to the vendor (its default; range 5000–60000). */
export const EMAILOSINT_MODULE_TIMEOUT_MS = 15_000;
/** Whole-call deadline: the vendor answers once every module has finished or timed out. */
const EMAILOSINT_CALL_TIMEOUT_MS = 45_000;
const MAX_TEXT = 300;

const text = z.string().min(1).max(MAX_TEXT);

export const emailosintAccountSchema = z.strictObject({
  /** The vendor's module id, e.g. `github`. */
  service: text,
  /** Display name of the service, e.g. `GitHub`. */
  serviceName: text.nullable(),
  domain: text.nullable(),
  /** The vendor's category name, e.g. `Developer`. */
  category: text.nullable(),
  username: text.nullable(),
  displayName: text.nullable(),
  profileUrl: z.url().max(2048).nullable(),
});

export const emailosintBreachSourceSchema = z.strictObject({
  name: text,
  date: text.nullable(),
});

/**
 * An EmailOSINT lookup, read through an allowlist. Breach rows keep only the breach name and
 * date; infostealer rows keep only the origin host. No password, hash, login, phone, IP or
 * free AI text is ever copied, and the strict schema rejects any other key.
 */
export const emailosintLookupSnapshotSchema = z.strictObject({
  email: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("api.emailosint.org"),
  lookupId: text.nullable(),
  /** The vendor finished every module (`meta.completed`). */
  completed: z.boolean(),
  /** The whole run hit its limit and the result is partial (`meta.timed_out`). */
  timedOut: z.boolean(),
  /** The vendor redacted results (free plan); always false on a paid API key. */
  cloaked: z.boolean(),
  accounts: z.array(emailosintAccountSchema).max(EMAILOSINT_MAX_ACCOUNTS),
  /** Services where the address is registered (validator modules, no account detail). */
  registeredOn: z.array(text).max(EMAILOSINT_MAX_SITES),
  /** How many services reported the address as not registered. */
  notRegisteredCount: z.number().int().nonnegative(),
  breachTotal: z.number().int().nonnegative().nullable(),
  breachSourceCount: z.number().int().nonnegative().nullable(),
  breachSources: z
    .array(emailosintBreachSourceSchema)
    .max(EMAILOSINT_MAX_BREACH_SOURCES),
  stealerLogCount: z.number().int().nonnegative().nullable(),
  stealerOriginHosts: z.array(text).max(EMAILOSINT_MAX_STEALER_HOSTS),
  isTruncated: z.boolean(),
});

export type EmailosintAccount = z.infer<typeof emailosintAccountSchema>;
export type EmailosintBreachSource = z.infer<
  typeof emailosintBreachSourceSchema
>;
export type EmailosintLookupSnapshot = z.infer<
  typeof emailosintLookupSnapshotSchema
>;

function shortText(value: unknown): string | null {
  const s = asString(value);
  return s === null || s.length > MAX_TEXT ? null : s;
}

function httpUrl(value: unknown): string | null {
  const s = asString(value);
  if (s === null || s.length > 2048 || !URL.canParse(s)) return null;
  const url = new URL(s);
  return url.protocol === "https:" || url.protocol === "http:"
    ? url.href
    : null;
}

function nonNegativeInt(value: unknown): number | null {
  const n = asNumber(value);
  return n === null || !Number.isInteger(n) || n < 0 ? null : n;
}

/** `data.fields[]` as `key → value` for the few keys the snapshot keeps. */
function fieldValues(data: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (!isRecord(data)) return out;
  for (const field of recordRows(data.fields)) {
    const key = asString(field.key);
    if (key !== null && !out.has(key)) out.set(key, field.value);
  }
  return out;
}

function readAccount(row: Record<string, unknown>): EmailosintAccount | null {
  const mod = isRecord(row.module) ? row.module : {};
  const service = shortText(mod.id) ?? shortText(mod.name);
  if (service === null) return null;
  const fields = fieldValues(row.data);
  return {
    service,
    serviceName: shortText(mod.name_formatted),
    domain: shortText(mod.domain),
    category: shortText(mod.type_name),
    username: shortText(fields.get("username")),
    displayName:
      shortText(fields.get("full_name")) ?? shortText(fields.get("name")),
    profileUrl: httpUrl(fields.get("profile_url")),
  };
}

function siteNames(value: unknown): string[] {
  return recordRows(value).flatMap((row) => {
    const name = shortText(row.name_formatted) ?? shortText(row.name);
    return name === null ? [] : [name];
  });
}

function readBreachSources(results: unknown): EmailosintBreachSource[] {
  const seen = new Set<string>();
  const out: EmailosintBreachSource[] = [];
  for (const row of recordRows(results)) {
    const source = isRecord(row.source) ? row.source : {};
    const name = shortText(source.name);
    if (name === null) continue;
    const date = shortText(source.date);
    const key = `${name}\0${date ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, date });
  }
  return out;
}

function readOriginHosts(results: unknown): string[] {
  const hosts = new Set<string>();
  for (const row of recordRows(results)) {
    const origin = asString(row.origin);
    if (origin === null || !URL.canParse(origin)) continue;
    const host = new URL(origin).hostname;
    if (host !== "" && host.length <= MAX_TEXT) hosts.add(host);
  }
  return [...hosts];
}

function capped<T>(rows: T[], max: number): { rows: T[]; cut: boolean } {
  return rows.length > max
    ? { rows: rows.slice(0, max), cut: true }
    : { rows, cut: false };
}

/** Map a `POST /v1/lookup/email` body through the allowlist. */
export function parseEmailosintBody(
  email: string,
  queriedAt: string,
  body: unknown
): EmailosintLookupSnapshot {
  if (!isRecord(body)) {
    throw parseVendorError("EmailOSINT", email);
  }
  const meta = isRecord(body.meta) ? body.meta : {};
  const validator = isRecord(body.validator) ? body.validator : {};
  const breaches = isRecord(body.data_breaches) ? body.data_breaches : {};
  const stealers = isRecord(body.stealer_logs) ? body.stealer_logs : {};

  const accounts = capped(
    recordRows(body.accounts).flatMap((row) => {
      const account = readAccount(row);
      return account === null ? [] : [account];
    }),
    EMAILOSINT_MAX_ACCOUNTS
  );
  const registered = capped(
    [...new Set(siteNames(validator.registered))],
    EMAILOSINT_MAX_SITES
  );
  const sources = capped(
    readBreachSources(breaches.results),
    EMAILOSINT_MAX_BREACH_SOURCES
  );
  const hosts = capped(
    readOriginHosts(stealers.results),
    EMAILOSINT_MAX_STEALER_HOSTS
  );

  return emailosintLookupSnapshotSchema.parse({
    email,
    queriedAt,
    source: "api.emailosint.org",
    lookupId: shortText(meta.lookup_id),
    completed: asBool(meta.completed) ?? false,
    timedOut: asBool(meta.timed_out) ?? false,
    cloaked: asBool(body.cloaked) ?? false,
    accounts: accounts.rows,
    registeredOn: registered.rows,
    notRegisteredCount: siteNames(validator.unregistered).length,
    breachTotal: nonNegativeInt(breaches.amount),
    breachSourceCount: nonNegativeInt(breaches.sources),
    breachSources: sources.rows,
    stealerLogCount: nonNegativeInt(stealers.count),
    stealerOriginHosts: hosts.rows,
    isTruncated: accounts.cut || registered.cut || sources.cut || hosts.cut,
  });
}

type EmailosintOptions = {
  userAgent: string;
};

/**
 * EmailOSINT reverse email lookup (linked accounts, breach and infostealer exposure).
 * POST https://api.emailosint.org/v1/lookup/email, `Authorization: Bearer eo_…`; the API needs a
 * Business plan or higher (402 `api_not_in_plan` otherwise). The AI summary is always disabled.
 * A 429 (`plan_quota_reached`, or the 30 req/min limit) follows the shared bounded retry of
 * `fetchJson*`, then fails as `RateLimitedError`.
 * @see https://emailosint.org/docs
 */
export function fetchEmailosintLookupEffect(
  emailRaw: string,
  key: string,
  signal: AbortSignal,
  options: EmailosintOptions
): Effect.Effect<EmailosintLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchEmailosintLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const email = yield* Effect.try({
      try: () => normalizeEmail(emailRaw).email,
      catch: mapToolsCatch,
    });
    const { status, body } = yield* fetchJsonObjectEffect({
      url: "https://api.emailosint.org/v1/lookup/email",
      signal,
      service: "EmailOSINT",
      subject: email,
      limits: { timeoutMs: EMAILOSINT_CALL_TIMEOUT_MS },
      // 401 and 402 are the vendor refusing the key or plan: fixed caller-visible failures.
      acceptStatus: (code) =>
        (code >= 200 && code < 300) || code === 401 || code === 402,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "User-Agent": options.userAgent,
        },
        body: JSON.stringify({
          email,
          module_timeout_ms: EMAILOSINT_MODULE_TIMEOUT_MS,
          disable_ai_summary: true,
        }),
      },
    });
    if (status === 401) {
      return yield* new ValidationVendorError({
        message: "EmailOSINT API key invalid",
        cause: "HTTP 401",
      });
    }
    if (status === 402) {
      return yield* new ValidationVendorError({
        message: "EmailOSINT API access needs a Business plan or higher",
        cause: "HTTP 402",
      });
    }
    return yield* Effect.try({
      try: () => parseEmailosintBody(email, queriedAt, body),
      catch: mapToolsCatch,
    });
  });
}
