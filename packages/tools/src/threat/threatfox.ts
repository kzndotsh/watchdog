import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import {
  MissingCredentialError,
  ValidationVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { asString, isRecord } from "../parse/coerce";

export const threatfoxIocSchema = z.object({
  id: z.string().nullable(),
  ioc: z.string(),
  iocType: z.string().nullable(),
  threatType: z.string().nullable(),
  malware: z.string().nullable(),
  malwarePrintable: z.string().nullable(),
  confidenceLevel: z.number().nullable(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  tags: z.array(z.string()),
});

export const threatfoxLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain", "other"]),
  queriedAt: z.string().min(1),
  source: z.literal("threatfox-api.abuse.ch"),
  queryStatus: z.string(),
  found: z.boolean(),
  iocs: z.array(threatfoxIocSchema),
});

export type ThreatfoxIoc = z.infer<typeof threatfoxIocSchema>;
export type ThreatfoxLookupSnapshot = z.infer<
  typeof threatfoxLookupSnapshotSchema
>;

function classifyQuery(raw: string): {
  kind: "ip" | "domain" | "other";
  value: string;
} {
  const trimmed = raw.trim();
  try {
    const classified = classifyIpOrHost(trimmed);
    if (classified.kind === "ip") return classified;
    if (
      trimmed.includes(".") &&
      !trimmed.includes("/") &&
      !trimmed.includes(" ")
    ) {
      return classified;
    }
  } catch {
    /* fall through */
  }
  return { kind: "other", value: trimmed };
}

/**
 * ThreatFox (abuse.ch) IOC search — malware C2 / payload IOCs.
 * Distinct from AbuseIPDB.com. POST …/api/v1/ with Auth-Key header.
 * @see https://threatfox.abuse.ch/api/
 */

interface ThreatfoxOptions {
  userAgent?: string;
}

export function fetchThreatfoxLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: ThreatfoxOptions
): Effect.Effect<ThreatfoxLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchThreatfoxLookupGen() {
    const { kind, value } = classifyQuery(queryRaw);
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "THREATFOX_API_KEY" });
    }

    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.threatfox.lookup");

    const { body } = yield* fetchJsonObjectEffect({
      url: "https://threatfox-api.abuse.ch/api/v1/",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Auth-Key": key,
          "User-Agent": ua,
        },
        body: JSON.stringify({
          query: "search_ioc",
          search_term: value,
          exact_match: true,
        }),
      },
      signal,
      service: "ThreatFox",
      subject: value,
    });
    const queryStatus =
      typeof body.query_status === "string" ? body.query_status : "unknown";

    if (queryStatus === "no_result") {
      return threatfoxLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "threatfox-api.abuse.ch",
        queryStatus,
        found: false,
        iocs: [],
      });
    }

    if (queryStatus !== "ok") {
      return yield* new ValidationVendorError({
        message: `ThreatFox query_status=${queryStatus} for ${value}`,
      });
    }

    const rows = Array.isArray(body.data) ? body.data : [];
    const iocs: ThreatfoxIoc[] = [];
    for (const row of rows) {
      if (!isRecord(row)) continue;
      const ioc = asString(row.ioc);
      if (!ioc) continue;
      const tags = Array.isArray(row.tags)
        ? row.tags.filter((t): t is string => typeof t === "string")
        : [];
      iocs.push({
        id: asString(row.id),
        ioc,
        iocType: asString(row.ioc_type),
        threatType: asString(row.threat_type),
        malware: asString(row.malware),
        malwarePrintable: asString(row.malware_printable),
        confidenceLevel:
          typeof row.confidence_level === "number"
            ? row.confidence_level
            : null,
        firstSeen: asString(row.first_seen),
        lastSeen: asString(row.last_seen),
        tags,
      });
    }

    return threatfoxLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "threatfox-api.abuse.ch",
      queryStatus,
      found: iocs.length > 0,
      iocs,
    });
  });
}
