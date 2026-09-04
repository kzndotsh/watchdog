import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { asStringEmpty as asString, isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const certspotterIssuanceSchema = z.object({
  id: z.string(),
  dnsNames: z.array(z.string()),
  notBefore: z.string().nullable(),
  notAfter: z.string().nullable(),
  revoked: z.boolean().nullable(),
  certSha256: z.string().nullable(),
});

export const certspotterLookupSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("api.certspotter.com/v1/issuances"),
  domains: z.array(z.string()),
  issuances: z.array(certspotterIssuanceSchema),
});

export type CertspotterIssuance = z.infer<typeof certspotterIssuanceSchema>;
export type CertspotterLookupSnapshot = z.infer<
  typeof certspotterLookupSnapshotSchema
>;

/**
 * Cert Spotter CT issuances (SSLMate) — second CT source beside crt.sh.
 * GET https://api.certspotter.com/v1/issuances?domain=&include_subdomains=true&expand=dns_names
 * @see https://sslmate.com/certspotter/api/
 */

interface CertspotterOptions {
  userAgent?: string;
  limit?: number;
}

function parseIssuanceId(row: Record<string, unknown>): string | null {
  const idRaw = row.id;
  if (typeof idRaw === "number" && Number.isFinite(idRaw)) {
    return String(idRaw);
  }
  const id = asString(idRaw);
  return id || null;
}

function collectDnsNames(
  row: Record<string, unknown>,
  seen: Set<string>,
  domains: string[]
): string[] {
  const dnsNamesRaw = Array.isArray(row.dns_names) ? row.dns_names : [];
  const dnsNames: string[] = [];
  for (const n of dnsNamesRaw) {
    if (typeof n !== "string") continue;
    try {
      const d = normalizeHost(n.replace(/^\*\./, ""));
      dnsNames.push(d);
      if (!seen.has(d)) {
        seen.add(d);
        domains.push(d);
      }
    } catch {
      /* skip */
    }
  }
  return dnsNames;
}

function issuanceFromRow(
  row: Record<string, unknown>,
  seen: Set<string>,
  domains: string[]
): CertspotterIssuance | null {
  const id = parseIssuanceId(row);
  if (!id) return null;
  return {
    id,
    dnsNames: collectDnsNames(row, seen, domains),
    notBefore: asString(row.not_before) || null,
    notAfter: asString(row.not_after) || null,
    revoked: typeof row.revoked === "boolean" ? row.revoked : null,
    certSha256: asString(row.cert_sha256) || null,
  };
}

function collectIssuances(
  rows: unknown[],
  limit: number
): { issuances: CertspotterIssuance[]; domains: string[] } {
  const issuances: CertspotterIssuance[] = [];
  const domains: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const issuance = issuanceFromRow(row, seen, domains);
    if (!issuance) continue;
    issuances.push(issuance);
    if (issuances.length >= limit) break;
  }
  return { issuances, domains };
}

export function fetchCertspotterLookupEffect(
  hostRaw: string,
  signal: AbortSignal,
  options?: CertspotterOptions
): Effect.Effect<CertspotterLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchCertspotterLookupGen() {
    const host = normalizeHost(hostRaw);
    const limit = options?.limit ?? 100;
    const ua =
      options?.userAgent ?? watchdogUserAgent("network.certspotter.lookup");

    const url = new URL("https://api.certspotter.com/v1/issuances");
    url.searchParams.set("domain", host);
    url.searchParams.set("include_subdomains", "true");
    url.searchParams.set("expand", "dns_names");

    const { body } = yield* fetchJsonUnknownEffect({
      url,
      signal,
      service: "Cert Spotter",
      subject: host,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });

    const rows = Array.isArray(body) ? body : [];
    const { issuances, domains } = collectIssuances(rows, limit);

    return certspotterLookupSnapshotSchema.parse({
      host,
      queriedAt: new Date().toISOString(),
      source: "api.certspotter.com/v1/issuances",
      domains,
      issuances,
    });
  });
}
