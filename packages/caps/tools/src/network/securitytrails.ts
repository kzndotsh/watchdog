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

export const securityTrailsIpSightingSchema = z.object({
  ip: z.string(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  organizations: z.array(z.string()),
});

const subdomainsPartSchema = z.object({
  subdomains: z.array(z.string()),
  subdomainCount: z.number().int().nullable(),
});

const ipHistoryPartSchema = z.object({
  ipHistory: z.array(securityTrailsIpSightingSchema),
  historyPages: z.number().int().nullable(),
});

export const securityTrailsLookupSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal(SOURCE),
  ...subdomainsPartSchema.shape,
  ...ipHistoryPartSchema.shape,
});

export type SecurityTrailsIpSighting = z.infer<
  typeof securityTrailsIpSightingSchema
>;
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

function ipSightings(
  host: string,
  records: unknown
): SecurityTrailsIpSighting[] {
  if (!Array.isArray(records)) throw parseVendorError("SecurityTrails", host);
  const out: SecurityTrailsIpSighting[] = [];
  for (const record of records) {
    if (!isRecord(record) || !Array.isArray(record.values)) continue;
    const organizations = Array.isArray(record.organizations)
      ? record.organizations.filter((o): o is string => typeof o === "string")
      : [];
    for (const value of record.values) {
      if (!isRecord(value)) continue;
      const raw = asString(value.ip);
      if (!raw) continue;
      let ip: string;
      try {
        ip = normalizeIp(raw);
      } catch {
        continue;
      }
      out.push({
        ip,
        firstSeen: asString(record.first_seen) ?? null,
        lastSeen: asString(record.last_seen) ?? null,
        organizations,
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

/** First page of A-record history. @see https://docs.securitytrails.com/reference/dns-history-by-record-type-old-1 */
const fetchIpHistory = defineJsonProvider({
  service: "SecurityTrails",
  schema: ipHistoryPartSchema,
  key: { header: "APIKEY" },
  normalize: normalizeHost,
  request: (host, _options: SecurityTrailsOptions) => ({
    url: `${BASE}/history/${encodeURIComponent(host)}/dns/a`,
  }),
  notFound: () => ({ ipHistory: [], historyPages: 0 }),
  toSnapshot: ({ subject, body }) => ({
    ipHistory: ipSightings(subject, body.records),
    historyPages: intOrNull(body.pages),
  }),
});

/**
 * SecurityTrails subdomains plus the first page of A-record history for one domain: two calls,
 * so two units of the account's monthly quota. Key in the `APIKEY` header.
 * @see https://docs.securitytrails.com/docs/authentication
 */
export function fetchSecurityTrailsLookupEffect(
  hostRaw: string,
  key: string,
  signal: AbortSignal,
  options: SecurityTrailsOptions
): Effect.Effect<
  SecurityTrailsLookupSnapshot,
  ToolsTag,
  HttpClient.HttpClient
> {
  return Effect.gen(function* fetchSecurityTrailsLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const host = normalizeHost(hostRaw);
    const subdomains = yield* fetchSubdomains(host, key, signal, options);
    const history = yield* fetchIpHistory(host, key, signal, options);
    return securityTrailsLookupSnapshotSchema.parse({
      host,
      queriedAt,
      source: SOURCE,
      ...subdomains,
      ...history,
    });
  });
}
