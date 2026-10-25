import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-catch";
import {
  HttpVendorError,
  MissingCredentialError,
  ParseVendorError,
  ValidationVendorError,
  type RateLimitedError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { nowIsoStringEffect } from "../infra/clock";
import { classifyBreachQuery } from "../parse/classify-breach-query";
import { asNumber, recordRows } from "../parse/coerce";

/**
 * LeakRadar masked search: `POST /search/email`, `GET /search/domain/{domain}` and
 * `GET /search/domain/{domain}/all`, with `Authorization: Bearer <key>`.
 * @see https://docs.leakradar.io/openapi.json
 *
 * Masked only. Searching is free, unlocking spends the account's points, so this client has no
 * route that unlocks, exports or reads a password range, and never sends `auto_unlock`. Every
 * field of a response is read by name below (an allowlist): a password, a plaintext username, a
 * leak id or a full URL never reaches the snapshot, whether or not the API returned one.
 * Terms: https://leakradar.io/en/terms (no redistribution or derivative datasets, no contacting
 * breach victims, no high-volume extraction), so one bounded page is read per call.
 */

const BASE_URL = "https://api.leakradar.io";
const SERVICE = "LeakRadar";
const SLOT = "LEAKRADAR_API_KEY";

export const LEAKRADAR_DEFAULT_PAGE_SIZE = 25;
export const LEAKRADAR_MAX_PAGE_SIZE = 100;
export const LEAKRADAR_MAX_PAGE = 10;

/** The longest `Retry-After` waited out once inside a Job; a longer one fails the run. */
const MAX_RETRY_AFTER_MS = 5000;
/** The wait when a 429 carries no usable `Retry-After`. */
const DEFAULT_RETRY_AFTER_MS = 1000;
const HOST_MAX = 253;
const USERNAME_MAX = 128;

export const leakradarKindSchema = z.enum(["email", "username", "domain"]);
export type LeakradarKind = z.infer<typeof leakradarKindSchema>;

export const leakradarRecordSchema = z
  .object({
    /** The API's own partially masked form (`a***@example.com`); never the plain value. */
    usernameMasked: z.string().nullable(),
    /** Host of the source URL, with no scheme, credentials, port, path or query. */
    host: z.string().nullable(),
    sourceType: z.enum(["web", "android_app", "other"]).nullable(),
    isEmail: z.boolean().nullable(),
    addedAt: z.string().nullable(),
    unlocked: z.boolean(),
    category: z.enum(["employees", "customers", "third_parties"]).nullable(),
  })
  .strict();

export const leakradarDomainCountsSchema = z
  .object({
    employees: z.number().int(),
    thirdParties: z.number().int(),
    customers: z.number().int(),
    approximate: z.boolean().nullable(),
    samplingProbability: z.number().nullable(),
  })
  .strict();

export const leakradarLookupSnapshotSchema = z
  .object({
    query: z.string().min(1),
    kind: leakradarKindSchema,
    queriedAt: z.string().min(1),
    source: z.literal("api.leakradar.io"),
    found: z.boolean(),
    total: z.number().int(),
    totalUnlocked: z.number().int().nullable(),
    /** Per-category counts of a domain report; null for an email or username search. */
    domainCounts: leakradarDomainCountsSchema.nullable(),
    page: z.number().int(),
    pageSize: z.number().int(),
    /** Whether `records` holds a listing page (a domain summary alone lists none). */
    listed: z.boolean(),
    /** More matching records exist beyond the page read. */
    isTruncated: z.boolean(),
    records: z.array(leakradarRecordSchema),
  })
  .strict();

export type LeakradarRecord = z.infer<typeof leakradarRecordSchema>;
export type LeakradarDomainCounts = z.infer<typeof leakradarDomainCountsSchema>;
export type LeakradarLookupSnapshot = z.infer<
  typeof leakradarLookupSnapshotSchema
>;

export type LeakradarOptions = {
  userAgent?: string;
  /** Explicit kind; otherwise detected from the query. */
  kind?: LeakradarKind;
  /** 1 to `LEAKRADAR_MAX_PAGE`; default 1. */
  page?: number;
  /** 1 to `LEAKRADAR_MAX_PAGE_SIZE`; default `LEAKRADAR_DEFAULT_PAGE_SIZE`. */
  pageSize?: number;
  /** A domain also reads one page of the masked listing; an email or username always does. */
  includeRecords?: boolean;
};

const refused = (message: string) => new ValidationVendorError({ message });

/** Email, username or domain. An IP is refused: LeakRadar does not search by address. */
export function classifyLeakradarQuery(
  raw: string,
  kind?: LeakradarKind
): { kind: LeakradarKind; value: string } {
  const detected = classifyBreachQuery(raw);
  if (kind === undefined) {
    if (detected.kind === "ip") {
      throw refused("LeakRadar searches email, username and domain only");
    }
    // A bare label ("alice") parses as a host; a domain has a dot.
    if (detected.kind === "domain" && !detected.value.includes(".")) {
      return { kind: "username", value: raw.trim() };
    }
    return { kind: detected.kind, value: detected.value };
  }
  if (kind === "username") {
    const value = raw.trim();
    if (value === "" || value.length > USERNAME_MAX || /\s/.test(value)) {
      throw refused("LeakRadar username is not valid");
    }
    return { kind, value };
  }
  if (detected.kind !== kind) {
    throw refused(`LeakRadar query is not a ${kind}`);
  }
  return { kind, value: detected.value };
}

function maskedUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  // Only a value the API masked is kept: no `*` means it may be the plain account name.
  return text.includes("*") && text.length <= 320 ? text : null;
}

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):\/\//i;
const HOST_RE = /^[a-z0-9*][a-z0-9.*_-]*$/;

/** Host and source type of a leak's source URL; path, query, userinfo and port are dropped. */
function sourceOf(
  value: unknown
): Pick<LeakradarRecord, "host" | "sourceType"> {
  const none = { host: null, sourceType: null };
  if (typeof value !== "string") return none;
  const text = value.trim();
  const scheme = SCHEME_RE.exec(text);
  if (scheme === null) return none;
  const authority = text.slice(scheme[0].length).split(/[/?#]/, 1)[0] ?? "";
  const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
  const host = hostPort.replace(/:\d*$/, "").toLowerCase();
  if (host === "" || host.length > HOST_MAX || !HOST_RE.test(host)) {
    return none;
  }
  const name = (scheme[1] ?? "").toLowerCase();
  let sourceType: LeakradarRecord["sourceType"] = "other";
  if (name === "http" || name === "https") sourceType = "web";
  else if (name === "android") sourceType = "android_app";
  return { host, sourceType };
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text !== "" && !Number.isNaN(Date.parse(text)) ? text : null;
}

function categoryOf(value: unknown): LeakradarRecord["category"] {
  switch (value) {
    case "employees":
    case "customers":
    case "third_parties": {
      return value;
    }
    default: {
      return null;
    }
  }
}

/** The allowlist: only these keys are read; `password`, `username`, `id` and `status` never are. */
function toRecord(raw: Record<string, unknown>): LeakradarRecord {
  return {
    usernameMasked: maskedUsername(raw.username_masked),
    ...sourceOf(raw.url),
    isEmail: typeof raw.is_email === "boolean" ? raw.is_email : null,
    addedAt: isoDate(raw.added_at),
    unlocked: raw.unlocked === true,
    category: categoryOf(raw.category),
  };
}

function wholeCount(value: unknown): number | null {
  const n = asNumber(value);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

function parseListing(
  body: Record<string, unknown>,
  pageSize: number
): { records: LeakradarRecord[]; total: number; totalUnlocked: number | null } {
  if (!Array.isArray(body.items)) {
    throw new ParseVendorError({
      service: SERVICE,
      subject: "listing",
      detail: "LeakRadar listing had no items",
    });
  }
  const records = recordRows(body.items).slice(0, pageSize).map(toRecord);
  return {
    records,
    total: wholeCount(body.total) ?? records.length,
    totalUnlocked: wholeCount(body.total_unlocked),
  };
}

function parseDomainCounts(
  body: Record<string, unknown>
): LeakradarDomainCounts {
  const employees = wholeCount(body.employees_compromised);
  const thirdParties = wholeCount(body.third_parties_compromised);
  const customers = wholeCount(body.customers_compromised);
  if (employees === null || thirdParties === null || customers === null) {
    throw new ParseVendorError({
      service: SERVICE,
      subject: "domain report",
      detail: "LeakRadar domain report had no counts",
    });
  }
  return {
    employees,
    thirdParties,
    customers,
    approximate:
      typeof body.counts_approximate === "boolean"
        ? body.counts_approximate
        : null,
    samplingProbability: asNumber(body.sampling_probability),
  };
}

/** 401, 402 and 403 are about the key or plan; the rest stay HTTP failures. */
function mapStatus(error: HttpVendorError) {
  switch (error.status) {
    case 401: {
      return new ValidationVendorError({
        message: "LeakRadar rejected the API key",
        cause: "HTTP 401",
      });
    }
    case 402:
    case 403: {
      return new ValidationVendorError({
        message: "LeakRadar plan or account does not allow this search",
        cause: `HTTP ${error.status}`,
      });
    }
    case 503: {
      return new HttpVendorError({
        service: SERVICE,
        status: 503,
        detail:
          "LeakRadar search is unavailable (maintenance); try again later",
      });
    }
    default: {
      return error;
    }
  }
}

const failMapped = (failure: HttpVendorError) =>
  Effect.fail(mapStatus(failure));

type Call = {
  url: string;
  init: RequestInit;
  signal: AbortSignal;
  subject: string;
};

/**
 * One call. The shared 429 retry waits as long as `Retry-After` says, which can outlast a Job, so
 * it is off: one retry after a short wait, and a longer wait or a second 429 fails as
 * rate-limited.
 */
function callEffect(
  input: Call
): Effect.Effect<Record<string, unknown>, ToolsTag, HttpClient.HttpClient> {
  const once = fetchJsonObjectEffect({
    ...input,
    service: SERVICE,
    retry: false,
  }).pipe(
    Effect.map((res) => res.body),
    Effect.catchTag("HttpVendorError", failMapped)
  );
  const waitThenRetry = (error: RateLimitedError) => {
    const waitMs = error.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
    if (waitMs > MAX_RETRY_AFTER_MS) return Effect.fail(error);
    return Effect.sleep(waitMs).pipe(Effect.andThen(once));
  };
  return once.pipe(Effect.catchTag("RateLimitedError", waitThenRetry));
}

function clampInt(
  value: number | undefined,
  fallback: number,
  max: number
): number {
  if (value === undefined || !Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, 1), max);
}

export function fetchLeakradarLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: LeakradarOptions
): Effect.Effect<LeakradarLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchLeakradarLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: SLOT });
    }
    const { kind, value } = yield* Effect.try({
      try: () => classifyLeakradarQuery(queryRaw, options?.kind),
      catch: mapToolsCatch,
    });

    const page = clampInt(options?.page, 1, LEAKRADAR_MAX_PAGE);
    const pageSize = clampInt(
      options?.pageSize,
      LEAKRADAR_DEFAULT_PAGE_SIZE,
      LEAKRADAR_MAX_PAGE_SIZE
    );
    const paging = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    }).toString();
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "User-Agent":
        options?.userAgent ?? watchdogUserAgent("breach.leakradar.lookup"),
    };
    const subject = `${kind} search`;

    let result: {
      total: number;
      totalUnlocked: number | null;
      domainCounts: LeakradarDomainCounts | null;
    } = { total: 0, totalUnlocked: null, domainCounts: null };
    let listing: LeakradarRecord[] = [];
    let listed = false;

    if (kind === "domain") {
      const path = `${BASE_URL}/search/domain/${encodeURIComponent(value)}`;
      const summary = yield* callEffect({
        url: path,
        init: { method: "GET", headers },
        signal,
        subject,
      });
      const counts = yield* Effect.try({
        try: () => parseDomainCounts(summary),
        catch: mapToolsCatch,
      });
      result = {
        total: counts.employees + counts.thirdParties + counts.customers,
        totalUnlocked: null,
        domainCounts: counts,
      };
      if (options?.includeRecords === true && result.total > 0) {
        const body = yield* callEffect({
          url: `${path}/all?${paging}`,
          init: { method: "GET", headers },
          signal,
          subject,
        });
        const parsed = yield* Effect.try({
          try: () => parseListing(body, pageSize),
          catch: mapToolsCatch,
        });
        listing = parsed.records;
        listed = true;
        result = {
          ...result,
          total: parsed.total,
          totalUnlocked: parsed.totalUnlocked,
        };
      }
    } else {
      const body = yield* callEffect({
        url: `${BASE_URL}/search/email?${paging}`,
        init: {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ email: value, is_email: kind === "email" }),
        },
        signal,
        subject,
      });
      const parsed = yield* Effect.try({
        try: () => parseListing(body, pageSize),
        catch: mapToolsCatch,
      });
      listing = parsed.records;
      listed = true;
      result = {
        total: parsed.total,
        totalUnlocked: parsed.totalUnlocked,
        domainCounts: null,
      };
    }

    return leakradarLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt,
      source: "api.leakradar.io",
      found: result.total > 0,
      total: result.total,
      totalUnlocked: result.totalUnlocked,
      domainCounts: result.domainCounts,
      page,
      pageSize,
      listed,
      isTruncated: listed && page * pageSize < result.total,
      records: listing,
    });
  });
}
