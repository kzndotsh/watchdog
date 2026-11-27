import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import { validateIdentifierValue } from "@watchdog/domain/schemas/graph";

import {
  RateLimitedError,
  type ParseVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import {
  httpVendorError,
  parseVendorError,
  validationVendorError,
} from "../errors/vendor-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { normalizeHost } from "../normalize";
import { asNumber, asString, isRecord } from "../parse/coerce";

const SERVICE = "ViewDNS";
const SOURCE = "api.viewdns.info";
const BASE = "https://api.viewdns.info";

/** What a free or sandbox key gets back from reverse WHOIS in place of a result. */
const DEMO_QUERY = "demonstration---tool-for-paid-users-only";

/** Reverse WHOIS is a paid ViewDNS product; a fixed sentence, since it reaches clients. */
const PAID_PLAN_MESSAGE = "ViewDNS reverse WHOIS needs a paid ViewDNS plan";

/** The two ways ViewDNS lists the domains that share a server. */
export const VIEWDNS_REVERSE_HOST_VIA = ["ns", "mx"] as const;
export const viewDnsReverseHostViaSchema = z.enum(VIEWDNS_REVERSE_HOST_VIA);
export type ViewDnsReverseHostVia = z.infer<typeof viewDnsReverseHostViaSchema>;

export const viewDnsReverseHostSnapshotSchema = z.object({
  server: z.string().min(1),
  via: viewDnsReverseHostViaSchema,
  queriedAt: z.string().min(1),
  source: z.literal(SOURCE),
  domainCount: z.number().int().nullable(),
  totalPages: z.number().int().nullable(),
  /** First page only, normalized and without repeats. */
  domains: z.array(z.string()),
});

export const viewDnsWhoisMatchSchema = z.object({
  domain: z.string().min(1),
  createdDate: z.string().nullable(),
  registrar: z.string().nullable(),
});

export const viewDnsReverseWhoisSnapshotSchema = z.object({
  query: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal(SOURCE),
  resultCount: z.number().int().nullable(),
  totalPages: z.number().int().nullable(),
  /** First page only (up to 1,000), normalized and without repeats. */
  matches: z.array(viewDnsWhoisMatchSchema),
});

export type ViewDnsReverseHostSnapshot = z.infer<
  typeof viewDnsReverseHostSnapshotSchema
>;
export type ViewDnsWhoisMatch = z.infer<typeof viewDnsWhoisMatchSchema>;
export type ViewDnsReverseWhoisSnapshot = z.infer<
  typeof viewDnsReverseWhoisSnapshotSchema
>;

/** Reverse NS and reverse MX share one call: only the path, the parameter and the row shape differ. */
const REVERSE_HOST: Record<
  ViewDnsReverseHostVia,
  { path: string; param: string; readDomain: (row: unknown) => unknown }
> = {
  ns: {
    path: "reversens",
    param: "ns",
    readDomain: (row) => (isRecord(row) ? row.domain : undefined),
  },
  mx: { path: "reversemx", param: "mx", readDomain: (row) => row },
};

type ViewDnsOptions = { userAgent: string };

function intOrNull(value: unknown): number | null {
  const n = asNumber(value);
  return n === null ? null : Math.trunc(n);
}

function requestUrl(path: string, param: string, value: string): URL {
  const url = new URL(`${BASE}/${path}/`);
  url.searchParams.set(param, value);
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");
  return url;
}

/**
 * The `response` object of a 2xx body. The legacy endpoints answer 200 with `response.error` for a
 * refused key or a used-up quota; each becomes a tools error with a fixed message, never the
 * upstream text.
 */
function responseOf(
  body: Record<string, unknown>,
  subject: string
): Record<string, unknown> {
  const { response } = body;
  if (!isRecord(response)) {
    throw parseVendorError(
      SERVICE,
      subject,
      "ViewDNS response had no result object"
    );
  }
  const error = asString(response.error);
  if (error === null) return response;
  const text = error.toLowerCase();
  if (text.includes("limit")) {
    throw new RateLimitedError({ service: SERVICE, subject });
  }
  if (text.includes("api key") || text.includes("apikey")) {
    throw httpVendorError(SERVICE, 401, "ViewDNS rejected the API key");
  }
  throw parseVendorError(SERVICE, subject, "ViewDNS reported an error");
}

/** Hosts ViewDNS lists, normalized, valid as domain Identifiers and without repeats. */
function distinctDomains(rows: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rows) {
    const text = asString(raw);
    if (text === null) continue;
    const host = normalizeHost(text);
    if (seen.has(host) || !validateIdentifierValue("domain", host).ok) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

/**
 * The result rows. ViewDNS leaves the array out of an empty result (count "0"), which is an empty
 * list; a missing array beside a non-zero count, or a non-array, is a malformed body.
 */
function rowsOf(
  response: Record<string, unknown>,
  field: "domains" | "matches",
  countField: "domain_count" | "result_count",
  subject: string
): readonly unknown[] {
  const rows = response[field];
  if (Array.isArray(rows)) return rows;
  if (rows === undefined && intOrNull(response[countField]) === 0) return [];
  throw parseVendorError(SERVICE, subject, `ViewDNS response had no ${field}`);
}

/** A 2xx body that is plain text (the bare quota message) fails the JSON read with no detail. */
function explainNonJson(
  error: ParseVendorError
): Effect.Effect<never, ToolsTag> {
  return Effect.fail(
    error.detail === undefined
      ? parseVendorError(
          SERVICE,
          error.subject,
          "ViewDNS did not answer with JSON; its query limit may be used up"
        )
      : error
  );
}

/** @see https://viewdns.info/api/ */
const fetchReverseHost = defineJsonProvider({
  service: SERVICE,
  schema: viewDnsReverseHostSnapshotSchema,
  key: { query: "apikey" },
  normalize: normalizeHost,
  request: (
    server,
    options: ViewDnsOptions & { via: ViewDnsReverseHostVia }
  ) => {
    const { path, param } = REVERSE_HOST[options.via];
    return { url: requestUrl(path, param, server) };
  },
  toSnapshot: ({ subject, queriedAt, body, options }) => {
    const response = responseOf(body, subject);
    const { readDomain } = REVERSE_HOST[options.via];
    const rows = rowsOf(response, "domains", "domain_count", subject);
    return {
      server: subject,
      via: options.via,
      queriedAt,
      source: SOURCE,
      domainCount: intOrNull(response.domain_count),
      totalPages: intOrNull(response.total_pages),
      domains: distinctDomains(rows.map(readDomain)),
    };
  },
});

function whoisMatches(
  rows: readonly unknown[]
): z.input<typeof viewDnsWhoisMatchSchema>[] {
  const seen = new Set<string>();
  const matches: z.input<typeof viewDnsWhoisMatchSchema>[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const [domain] = distinctDomains([row.domain]);
    if (domain === undefined || seen.has(domain)) continue;
    seen.add(domain);
    matches.push({
      domain,
      createdDate: asString(row.created_date),
      registrar: asString(row.registrar),
    });
  }
  return matches;
}

/** @see https://viewdns.info/api/ */
const fetchReverseWhois = defineJsonProvider({
  service: SERVICE,
  schema: viewDnsReverseWhoisSnapshotSchema,
  key: { query: "apikey" },
  normalize: (raw) => raw.trim(),
  request: (query, _options: ViewDnsOptions) => ({
    url: requestUrl("reversewhois", "q", query),
  }),
  toSnapshot: ({ subject, queriedAt, body }) => {
    const response = responseOf(body, subject);
    if (isRecord(body.query) && body.query.query === DEMO_QUERY) {
      throw validationVendorError(PAID_PLAN_MESSAGE);
    }
    const rows = rowsOf(response, "matches", "result_count", subject);
    return {
      query: subject,
      queriedAt,
      source: SOURCE,
      resultCount: intOrNull(response.result_count),
      totalPages: intOrNull(response.total_pages),
      matches: whoisMatches(rows),
    };
  },
});

/**
 * The domains ViewDNS lists on one nameserver (`via: "ns"`) or mail server (`via: "mx"`), page 1
 * only: one query of the account's monthly quota. The key travels in the query string.
 * @see https://viewdns.info/reversens/
 * @see https://viewdns.info/reversemx/
 */
export function fetchViewDnsReverseHostEffect(
  host: string,
  via: ViewDnsReverseHostVia,
  key: string,
  signal: AbortSignal,
  options: ViewDnsOptions
): Effect.Effect<ViewDnsReverseHostSnapshot, ToolsTag, HttpClient.HttpClient> {
  return fetchReverseHost(host, key, signal, { ...options, via }).pipe(
    Effect.catchTag("ParseVendorError", explainNonJson)
  );
}

/**
 * The domains whose WHOIS record mentions an email, name or organization, page 1 only: one query of
 * the account's monthly quota. A free or sandbox key gets demonstration data, which fails here.
 * @see https://viewdns.info/reversewhois/
 */
export function fetchViewDnsReverseWhoisEffect(
  query: string,
  key: string,
  signal: AbortSignal,
  options: ViewDnsOptions
): Effect.Effect<ViewDnsReverseWhoisSnapshot, ToolsTag, HttpClient.HttpClient> {
  return fetchReverseWhois(query, key, signal, options).pipe(
    Effect.catchTag("ParseVendorError", explainNonJson)
  );
}
