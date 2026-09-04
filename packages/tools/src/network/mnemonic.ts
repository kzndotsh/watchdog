import { isIP } from "node:net";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { httpToolsError, parseToolsError } from "../errors/tools-error";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { asNumber, asStringEmpty as asString, isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const mnemonicRecordSchema = z.object({
  query: z.string(),
  answer: z.string(),
  rrtype: z.string().nullable(),
  times: z.number().int().nullable(),
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
});

export const mnemonicLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain"]),
  queriedAt: z.string().min(1),
  source: z.literal("api.mnemonic.no/pdns/v3"),
  count: z.number().int().nullable(),
  records: z.array(mnemonicRecordSchema),
  domains: z.array(z.string()),
  ips: z.array(z.string()),
});

export type MnemonicRecord = z.infer<typeof mnemonicRecordSchema>;
export type MnemonicLookupSnapshot = z.infer<
  typeof mnemonicLookupSnapshotSchema
>;

function msToIso(value: unknown): string | null {
  const n = asNumber(value);
  if (n === null) return null;
  return new Date(n).toISOString();
}

function rrtypeOf(row: Record<string, unknown>): string | null {
  const raw = asString(row.rrtype) || asString(row.rrType);
  return raw === "" ? null : raw.toLowerCase();
}

/**
 * Parse Mnemonic PDNS v3 JSON (`data[]` records with firstSeenTimestamp /
 * lastSeenTimestamp / times).
 */
export function parseMnemonicPdnsBody(
  query: string,
  kind: MnemonicLookupSnapshot["kind"],
  queriedAt: string,
  body: unknown
): MnemonicLookupSnapshot {
  if (!isRecord(body)) {
    throw parseToolsError("Mnemonic PDNS", query);
  }

  const responseCode = body.responseCode;
  if (responseCode === 402) {
    throw httpToolsError(
      "Mnemonic PDNS",
      402,
      `Mnemonic PDNS resource limit exceeded for ${query}`
    );
  }
  if (responseCode !== 200 && responseCode !== undefined) {
    const label =
      typeof responseCode === "number" || typeof responseCode === "string"
        ? String(responseCode)
        : JSON.stringify(responseCode);
    throw httpToolsError(
      "Mnemonic PDNS",
      typeof responseCode === "number" ? responseCode : 400,
      `Mnemonic PDNS responseCode=${label} for ${query}`
    );
  }

  const rows = Array.isArray(body.data) ? body.data : [];
  const records: MnemonicRecord[] = [];
  const domains: string[] = [];
  const ips: string[] = [];
  const seenDomain = new Set<string>();
  const seenIp = new Set<string>();

  for (const row of rows) {
    if (!isRecord(row)) continue;
    const q = asString(row.query);
    const answer = asString(row.answer);
    if (!q || !answer) continue;

    const rrtype = rrtypeOf(row);
    const timesRaw = asNumber(row.times);
    records.push({
      query: q,
      answer,
      rrtype,
      times: timesRaw === null ? null : Math.trunc(timesRaw),
      firstSeenAt:
        msToIso(row.firstSeenTimestamp) ??
        msToIso(row.firstSeen) ??
        msToIso(row.firstSeenTimestamp),
      lastSeenAt:
        msToIso(row.lastSeenTimestamp) ??
        msToIso(row.lastSeen) ??
        msToIso(row.lastSeenTimestamp),
    });

    if (kind === "ip") {
      const hostCandidate = q.includes("in-addr.arpa") ? answer : q;
      if (isIP(hostCandidate)) continue;
      try {
        const host = normalizeHost(hostCandidate);
        if (!seenDomain.has(host)) {
          seenDomain.add(host);
          domains.push(host);
        }
      } catch {
        /* skip */
      }
    } else if (rrtype === "a" || rrtype === "aaaa" || isIP(answer)) {
      try {
        const ip = normalizeIp(answer);
        if (!seenIp.has(ip)) {
          seenIp.add(ip);
          ips.push(ip);
        }
      } catch {
        /* skip */
      }
    } else if (rrtype === "cname" || rrtype === "ns" || rrtype === "mx") {
      try {
        const host = normalizeHost(answer.replace(/\.$/, ""));
        if (!seenDomain.has(host)) {
          seenDomain.add(host);
          domains.push(host);
        }
      } catch {
        /* skip */
      }
    }
  }

  const countRaw = asNumber(body.count) ?? asNumber(body.size);
  return mnemonicLookupSnapshotSchema.parse({
    query,
    kind,
    queriedAt,
    source: "api.mnemonic.no/pdns/v3",
    count: countRaw === null ? null : Math.trunc(countRaw),
    records,
    domains,
    ips,
  });
}

/**
 * Mnemonic PassiveDNS v3 — historical DNS for an IP or domain.
 * GET https://api.mnemonic.no/pdns/v3/{query}?limit=
 * @see https://docs.mnemonic.no/display/public/API/PassiveDNS+Integration+Guide
 */

interface MnemonicOptions {
  userAgent?: string;
  limit?: number;
}

export function fetchMnemonicPdnsEffect(
  queryRaw: string,
  signal: AbortSignal,
  options?: MnemonicOptions
): Effect.Effect<MnemonicLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchMnemonicPdnsGen() {
    const { kind, value } = classifyIpOrHost(queryRaw);
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 500);
    const ua =
      options?.userAgent ?? watchdogUserAgent("network.mnemonic.lookup");

    const url = new URL(
      `https://api.mnemonic.no/pdns/v3/${encodeURIComponent(value)}`
    );
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("aggregate", "true");

    const { body } = yield* fetchJsonUnknownEffect({
      url,
      signal,
      service: "Mnemonic PDNS",
      subject: value,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });
    return parseMnemonicPdnsBody(value, kind, new Date().toISOString(), body);
  });
}
