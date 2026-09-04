import { isIP } from "node:net";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import { ValidationVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const xforceLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain", "url", "hash"]),
  queriedAt: z.string().min(1),
  source: z.literal("exchange.xforce.ibmcloud.com"),
  found: z.boolean(),
  score: z.number().nullable(),
  cats: z.record(z.string(), z.number()),
  malwareCount: z.number().int(),
});

export type XforceLookupSnapshot = z.infer<typeof xforceLookupSnapshotSchema>;

const HASH_LENGTHS = new Set([32, 40, 64]);
const BASE_URL = "https://exchange.xforce.ibmcloud.com/api";

function classifyXforceQuery(raw: string): {
  kind: "ip" | "domain" | "url" | "hash";
  value: string;
} {
  const trimmed = raw.trim();
  if (/^[a-fA-F0-9]+$/.test(trimmed) && HASH_LENGTHS.has(trimmed.length)) {
    return { kind: "hash", value: trimmed.toLowerCase() };
  }
  if (isIP(trimmed)) {
    return { kind: "ip", value: normalizeIp(trimmed) };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return { kind: "url", value: trimmed };
  }
  return { kind: "domain", value: normalizeHost(trimmed) };
}

function normalizeCats(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const cats: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "number") cats[name] = value;
  }
  return cats;
}

function authHeader(apiKey: string, apiPassword: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiPassword}`).toString("base64")}`;
}

/**
 * IBM X-Force Exchange lookup — IP reputation (+ malware count), or URL /
 * malware-hash reports. HTTP Basic auth (API key + password).
 * @see https://api.xforce.ibmcloud.com/doc/
 */
export function fetchXforceLookupEffect(
  queryRaw: string,
  apiKey: string,
  apiPassword: string,
  signal: AbortSignal,
  options?: { userAgent?: string }
): Effect.Effect<XforceLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchXforceLookupGen() {
    const key = apiKey.trim();
    const password = apiPassword.trim();
    if (!key || !password) {
      return yield* new ValidationVendorError({
        message: "XFORCE_API_KEY and XFORCE_API_PASSWORD required",
      });
    }

    const { kind, value } = classifyXforceQuery(queryRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("threat.xforce.lookup");
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: authHeader(key, password),
      "User-Agent": ua,
    };
    const notFound = (): XforceLookupSnapshot =>
      xforceLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "exchange.xforce.ibmcloud.com",
        found: false,
        score: null,
        cats: {},
        malwareCount: 0,
      });

    const jsonInit = { method: "GET" as const, headers };

    switch (kind) {
      case "ip": {
        const { status, body } = yield* fetchJsonObjectEffect({
          url: `${BASE_URL}/ipr/${encodeURIComponent(value)}`,
          signal,
          service: "X-Force",
          subject: value,
          acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
          init: jsonInit,
        });
        if (status === 404) return notFound();
        const score = typeof body.score === "number" ? body.score : null;
        const cats = normalizeCats(body.cats);

        let malwareCount = 0;
        const { status: malStatus, body: malBody } =
          yield* fetchJsonObjectEffect({
            url: `${BASE_URL}/ipr/malware/${encodeURIComponent(value)}`,
            signal,
            service: "X-Force",
            subject: value,
            acceptStatus: () => true,
            init: jsonInit,
          });
        if (malStatus >= 200 && malStatus < 300) {
          if (Array.isArray(malBody.malware)) {
            malwareCount = malBody.malware.length;
          } else if (typeof malBody.count === "number") {
            malwareCount = malBody.count;
          }
        }

        return xforceLookupSnapshotSchema.parse({
          query: value,
          kind,
          queriedAt: new Date().toISOString(),
          source: "exchange.xforce.ibmcloud.com",
          found: true,
          score,
          cats,
          malwareCount,
        });
      }
      case "domain":
      case "url": {
        const { status, body } = yield* fetchJsonObjectEffect({
          url: `${BASE_URL}/url/${encodeURIComponent(value)}`,
          signal,
          service: "X-Force",
          subject: value,
          acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
          init: jsonInit,
        });
        if (status === 404) return notFound();
        const result = isRecord(body.result) ? body.result : body;
        return xforceLookupSnapshotSchema.parse({
          query: value,
          kind,
          queriedAt: new Date().toISOString(),
          source: "exchange.xforce.ibmcloud.com",
          found: true,
          score: typeof result.score === "number" ? result.score : null,
          cats: normalizeCats(result.cats),
          malwareCount: 0,
        });
      }
      case "hash": {
        const { status } = yield* fetchJsonObjectEffect({
          url: `${BASE_URL}/malware/${encodeURIComponent(value)}`,
          signal,
          service: "X-Force",
          subject: value,
          acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
          init: jsonInit,
        });
        if (status === 404) return notFound();

        return xforceLookupSnapshotSchema.parse({
          query: value,
          kind,
          queriedAt: new Date().toISOString(),
          source: "exchange.xforce.ibmcloud.com",
          found: true,
          score: null,
          cats: {},
          malwareCount: 1,
        });
      }
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  });
}
