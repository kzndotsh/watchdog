import { Effect } from "effect";
import type { HttpClient } from "effect/http";

import { mapToolsCatch } from "../errors/map-tools-catch";
import {
  ParseVendorError,
  ValidationVendorError,
  type RateLimitedError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { nowIsoStringEffect } from "../infra/clock";
import { isUnknownArray, parseCdxPayload, type ParsedCdx } from "./cdx-parse";
import { waybackBoundTimestamp } from "./date-bounds";
import { normalizeWaybackUrl } from "./normalize-url";
import {
  waybackLookupSnapshotSchema,
  type WaybackCdxRow,
  type WaybackLookupSnapshot,
} from "./schema";

const CDX = "https://web.archive.org/cdx/search/cdx";
const SERVICE = "Wayback CDX";

/** Captures counted for `totalCaptures` before the count is reported as a lower bound. */
const CDX_COUNT_CEILING = 5000;
/** The longest `Retry-After` worth waiting out inside one Job; a longer one fails the run. */
const CDX_MAX_BACKOFF_MS = 5000;
const CDX_DEFAULT_BACKOFF_MS = 2000;

export type WaybackStatusFilter = "200" | "ok" | "any";

export type WaybackLookupOptions = {
  userAgent: string;
  limit?: number;
  /** `200` (default), `ok` (200 or `-`: legacy captures record no status) or `any`. */
  statusFilter?: WaybackStatusFilter;
  /** Collapse by content digest (`collapse=digest`): one row per change. */
  distinctOnly?: boolean;
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, inclusive from the start of the period. */
  after?: string;
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, inclusive to the end of the period. */
  before?: string;
  /** From a previous run's `resumeKey`. */
  resumeKey?: string;
};

const STATUS_FILTERS: Record<WaybackStatusFilter, string | undefined> = {
  "200": "statuscode:200",
  ok: "statuscode:(200|-)",
  any: undefined,
};

function badBound(name: "after" | "before"): ValidationVendorError {
  return new ValidationVendorError({
    message: `Wayback ${name} must be YYYY, YYYY-MM or YYYY-MM-DD`,
  });
}

function nonJsonBody(subject: string): ParseVendorError {
  return new ParseVendorError({
    service: SERVICE,
    subject,
    detail:
      "Wayback CDX answered with a page instead of JSON (usually rate limiting); try again later",
  });
}

/**
 * One CDX call. The shared 429 retry waits as long as `Retry-After` says, which can outlast a
 * Job, so it is off here: one retry after a short wait, and a longer wait fails as rate-limited.
 * A body that is not JSON (an HTML error page) is a failure, never an empty result.
 */
function cdxJsonEffect(
  params: URLSearchParams,
  signal: AbortSignal,
  subject: string,
  userAgent: string
): Effect.Effect<unknown, ToolsTag, HttpClient.HttpClient> {
  const call = fetchJsonUnknownEffect({
    url: `${CDX}?${params.toString()}`,
    signal,
    service: SERVICE,
    subject,
    retry: false,
    init: { headers: { "User-Agent": userAgent } },
  }).pipe(
    Effect.map((res) => res.body),
    Effect.catchTag("ParseVendorError", () => Effect.fail(nonJsonBody(subject)))
  );
  const waitThenRetry = (error: RateLimitedError) => {
    const waitMs = error.retryAfterMs ?? CDX_DEFAULT_BACKOFF_MS;
    if (waitMs > CDX_MAX_BACKOFF_MS) return Effect.fail(error);
    return Effect.sleep(waitMs).pipe(Effect.flatMap(() => call));
  };
  return call.pipe(Effect.catchTag("RateLimitedError", waitThenRetry));
}

function baseParams(
  normalizedUrl: string,
  options: WaybackLookupOptions,
  from: string | null,
  to: string | null
): URLSearchParams {
  const params = new URLSearchParams({
    url: normalizedUrl,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest,length",
  });
  const filter = STATUS_FILTERS[options.statusFilter ?? "200"];
  if (filter !== undefined) params.set("filter", filter);
  if (from !== null) params.set("from", from);
  if (to !== null) params.set("to", to);
  return params;
}

function parsePage(payload: unknown, url: string): ParsedCdx {
  if (!isUnknownArray(payload) || payload.length === 0) {
    return { rows: [], resumeKey: null };
  }
  return parseCdxPayload(payload, url);
}

/** Versions among rows: a row whose digest differs from the one before it (CDX's own rule). */
export function countDigestChanges(rows: readonly WaybackCdxRow[]): number {
  let versions = 0;
  let previous: string | undefined;
  for (const row of rows) {
    if (versions === 0 || row.digest !== previous) versions += 1;
    previous = row.digest;
  }
  return versions;
}

type CaptureCount = { total: number | null; isLowerBound: boolean };

/** Best effort: an unavailable count is `null`, never a failure of the lookup itself. */
function countCapturesEffect(
  normalizedUrl: string,
  options: WaybackLookupOptions,
  from: string | null,
  to: string | null,
  signal: AbortSignal
): Effect.Effect<CaptureCount, never, HttpClient.HttpClient> {
  const params = baseParams(normalizedUrl, options, from, to);
  params.set("fl", "timestamp");
  params.set("limit", String(CDX_COUNT_CEILING));
  return cdxJsonEffect(params, signal, normalizedUrl, options.userAgent).pipe(
    Effect.map((payload): CaptureCount => {
      const { rows } = parsePage(payload, normalizedUrl);
      return {
        total: rows.length,
        isLowerBound: rows.length >= CDX_COUNT_CEILING,
      };
    }),
    Effect.catch(() =>
      Effect.succeed<CaptureCount>({ total: null, isLowerBound: false })
    )
  );
}

/**
 * CDX history rows for a URL — shared by archive.wayback.lookup, archive.page.history and
 * url.enrich.
 */
export function fetchWaybackLookupEffect(
  url: string,
  signal: AbortSignal,
  options: WaybackLookupOptions
): Effect.Effect<WaybackLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchWaybackLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const normalizedUrl = yield* Effect.try({
      try: () => normalizeWaybackUrl(url),
      catch: mapToolsCatch,
    });
    const from =
      options.after === undefined
        ? null
        : waybackBoundTimestamp(options.after, "after");
    if (options.after !== undefined && from === null) {
      return yield* badBound("after");
    }
    const to =
      options.before === undefined
        ? null
        : waybackBoundTimestamp(options.before, "before");
    if (options.before !== undefined && to === null) {
      return yield* badBound("before");
    }
    if (from !== null && to !== null && from > to) {
      return yield* new ValidationVendorError({
        message: "Wayback after must not be later than before",
      });
    }

    const distinctOnly = options.distinctOnly === true;
    const limit = options.limit ?? 25;
    const params = baseParams(normalizedUrl, options, from, to);
    params.set("limit", String(limit));
    params.set("showResumeKey", "true");
    if (distinctOnly) params.set("collapse", "digest");
    if (options.resumeKey !== undefined) {
      params.set("resumeKey", options.resumeKey);
    }

    const payload = yield* cdxJsonEffect(
      params,
      signal,
      normalizedUrl,
      options.userAgent
    );
    const { rows, resumeKey } = parsePage(payload, normalizedUrl);
    const isTruncated = resumeKey !== null;

    let total: number | null = rows.length;
    let isLowerBound = isTruncated;
    if (distinctOnly && rows.length > 0) {
      const counted = yield* countCapturesEffect(
        normalizedUrl,
        options,
        from,
        to,
        signal
      );
      total = counted.total;
      isLowerBound = counted.isLowerBound;
    }

    return waybackLookupSnapshotSchema.parse({
      url: normalizedUrl,
      queriedAt,
      source: "web.archive.org/cdx",
      rows,
      closestTimestamp: rows[0]?.timestamp ?? null,
      distinctOnly,
      from,
      to,
      statusFilter: options.statusFilter ?? "200",
      totalCaptures: total,
      totalCapturesIsLowerBound: isLowerBound,
      distinctVersions: countDigestChanges(rows),
      resumeKey,
      isTruncated,
    });
  });
}

/** Closest Wayback CDX timestamp for a URL (200 responses). UA from Cap policy. */
export function closestWaybackTimestampEffect(
  url: string,
  signal: AbortSignal,
  userAgent: string
): Effect.Effect<string | null, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* closestWaybackTimestampGen() {
    const snap = yield* fetchWaybackLookupEffect(url, signal, {
      userAgent,
      limit: 1,
      statusFilter: "200",
    });
    return snap.closestTimestamp;
  });
}
