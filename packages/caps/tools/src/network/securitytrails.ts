import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { z } from "zod";

import type { ToolsTag } from "../errors/tagged-errors";
import { parseVendorError } from "../errors/vendor-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { nowIsoStringEffect } from "../infra/clock";
import { normalizeHost, normalizeIp } from "../normalize";
import { asNumber, asString, isRecord } from "../parse/coerce";

const SOURCE = "api.securitytrails.com/v1";
const BASE = "https://api.securitytrails.com/v1";

/** The record types SecurityTrails keeps DNS history for, one quota query each. */
export const SECURITYTRAILS_DNS_TYPES = [
  "a",
  "aaaa",
  "mx",
  "ns",
  "soa",
  "txt",
] as const;
export const securityTrailsDnsTypeSchema = z.enum(SECURITYTRAILS_DNS_TYPES);
export type SecurityTrailsDnsType = z.infer<typeof securityTrailsDnsTypeSchema>;

export const securityTrailsDnsSightingSchema = z.object({
  /** An IP for A/AAAA, a host for MX/NS, the responsible mailbox for SOA, the record text for TXT. */
  value: z.string(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  organizations: z.array(z.string()),
  /** The alias an A/AAAA answer came through, when there was one. */
  cname: z.string().nullable(),
});

const dnsHistorySchema = z.object({
  type: securityTrailsDnsTypeSchema,
  pages: z.number().int().nullable(),
  records: z.array(securityTrailsDnsSightingSchema),
});

const subdomainsPartSchema = z.object({
  subdomains: z.array(z.string()),
  subdomainCount: z.number().int().nullable(),
});

export const securityTrailsLookupSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal(SOURCE),
  ...subdomainsPartSchema.shape,
  /** First page of history per requested record type, in request order. */
  dnsHistory: z.array(dnsHistorySchema),
});

export type SecurityTrailsDnsSighting = z.infer<
  typeof securityTrailsDnsSightingSchema
>;
export type SecurityTrailsDnsHistory = z.infer<typeof dnsHistorySchema>;
export type SecurityTrailsLookupSnapshot = z.infer<
  typeof securityTrailsLookupSnapshotSchema
>;

/** SecurityTrails returns labels (`www`), not names; a label already ending in "." takes the apex with no extra dot. */
function subdomainNames(host: string, labels: unknown): string[] {
  if (!Array.isArray(labels)) throw parseVendorError("SecurityTrails", host);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of labels) {
    const label = asString(raw);
    if (label === null) continue;
    const name = normalizeHost(
      label.endsWith(".") ? `${label}${host}` : `${label}.${host}`
    );
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function ipOrNull(raw: unknown): string | null {
  const s = asString(raw);
  if (s === null) return null;
  try {
    return normalizeIp(s);
  } catch {
    return null;
  }
}

function hostOrNull(raw: unknown): string | null {
  const s = asString(raw);
  return s === null ? null : normalizeHost(s);
}

/** Where each record type keeps its value (observed live 2026-11-26 against github.com). */
const VALUE_OF: Record<
  SecurityTrailsDnsType,
  (value: Record<string, unknown>) => string | null
> = {
  a: (v) => ipOrNull(v.ip),
  aaaa: (v) => ipOrNull(v.ip),
  mx: (v) => hostOrNull(v.host),
  ns: (v) => hostOrNull(v.nameserver),
  soa: (v) => asString(v.email),
  /** TXT data is character strings: kept verbatim, spaces and empty strings included. */
  txt: (v) => (typeof v.value === "string" ? v.value : null),
};

/** SOA history holds one value object per record; every other type holds a list. */
function recordValues(values: unknown): unknown[] {
  if (Array.isArray(values)) return values;
  return isRecord(values) ? [values] : [];
}

function sightings(
  host: string,
  type: SecurityTrailsDnsType,
  records: unknown
): SecurityTrailsDnsSighting[] {
  if (!Array.isArray(records)) throw parseVendorError("SecurityTrails", host);
  const out: SecurityTrailsDnsSighting[] = [];
  for (const record of records) {
    if (!isRecord(record)) continue;
    const organizations = Array.isArray(record.organizations)
      ? record.organizations.filter((o): o is string => typeof o === "string")
      : [];
    const cname = hostOrNull(record.cname);
    for (const raw of recordValues(record.values)) {
      if (!isRecord(raw)) continue;
      const value = VALUE_OF[type](raw);
      if (value === null) continue;
      out.push({
        value,
        firstSeen: asString(record.first_seen),
        lastSeen: asString(record.last_seen),
        organizations,
        cname,
      });
    }
  }
  return out;
}

function intOrNull(value: unknown): number | null {
  const n = asNumber(value);
  return n === null ? null : Math.trunc(n);
}

type SecurityTrailsOptions = { userAgent: string };

/** @see https://docs.securitytrails.com/reference/list-subdomains-old-1 */
const fetchSubdomains = defineJsonProvider({
  service: "SecurityTrails",
  schema: subdomainsPartSchema,
  key: { header: "APIKEY" },
  normalize: normalizeHost,
  request: (host, _options: SecurityTrailsOptions) => ({
    url: `${BASE}/domain/${encodeURIComponent(host)}/subdomains`,
  }),
  notFound: () => ({ subdomains: [], subdomainCount: 0 }),
  toSnapshot: ({ subject, body }) => ({
    subdomains: subdomainNames(subject, body.subdomains),
    subdomainCount: intOrNull(body.subdomain_count),
  }),
});

/** First page of one record type's history. @see https://docs.securitytrails.com/reference/dns-history-by-record-type-old-1 */
const fetchDnsHistory = defineJsonProvider({
  service: "SecurityTrails",
  schema: dnsHistorySchema,
  key: { header: "APIKEY" },
  normalize: normalizeHost,
  request: (
    host,
    options: SecurityTrailsOptions & { type: SecurityTrailsDnsType }
  ) => ({
    url: `${BASE}/history/${encodeURIComponent(host)}/dns/${options.type}`,
  }),
  notFound: ({ options }) => ({ type: options.type, pages: 0, records: [] }),
  toSnapshot: ({ subject, body, options }) => ({
    type: options.type,
    pages: intOrNull(body.pages),
    records: sightings(subject, options.type, body.records),
  }),
});

/**
 * SecurityTrails subdomains plus the first page of history for each requested record type: one
 * quota query for the subdomains and one per type. Key in the `APIKEY` header.
 * @see https://docs.securitytrails.com/docs/authentication
 */
export function fetchSecurityTrailsLookupEffect(
  hostRaw: string,
  key: string,
  signal: AbortSignal,
  options: SecurityTrailsOptions & {
    recordTypes: readonly SecurityTrailsDnsType[];
  }
): Effect.Effect<
  SecurityTrailsLookupSnapshot,
  ToolsTag,
  HttpClient.HttpClient
> {
  return Effect.gen(function* fetchSecurityTrailsLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const host = normalizeHost(hostRaw);
    const { userAgent } = options;
    const subdomains = yield* fetchSubdomains(host, key, signal, { userAgent });
    const dnsHistory: SecurityTrailsDnsHistory[] = [];
    for (const type of options.recordTypes) {
      dnsHistory.push(
        yield* fetchDnsHistory(host, key, signal, { userAgent, type })
      );
    }
    return securityTrailsLookupSnapshotSchema.parse({
      host,
      queriedAt,
      source: SOURCE,
      ...subdomains,
      dnsHistory,
    });
  });
}
