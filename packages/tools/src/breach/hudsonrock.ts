import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import {
  MissingCredentialError,
  ValidationVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { asString, isRecord, recordRows } from "../parse/coerce";

export const hudsonrockLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["email", "ip", "domain"]),
  queriedAt: z.string().min(1),
  source: z.literal("api.hudsonrock.com"),
  found: z.boolean(),
  totalResults: z.number().int(),
  newestDate: z.string().nullable(),
});

export type HudsonrockLookupSnapshot = z.infer<
  typeof hudsonrockLookupSnapshotSchema
>;

const BASE_URL = "https://api.hudsonrock.com/json/v3";
const RECORD_ARRAY_KEYS = ["data", "results", "stealers", "records"];
const DATE_KEYS = ["date_compromised", "dateCompromised", "date"];

/** Email, or IP/domain via `classifyIpOrHost` (invalid hosts throw). */
function classifyHudsonrockQuery(raw: string): {
  kind: "email" | "ip" | "domain";
  value: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    return { kind: "email", value: trimmed.toLowerCase() };
  }
  return classifyIpOrHost(trimmed);
}

function recordArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return recordRows(raw);
  if (!isRecord(raw)) return [];
  for (const key of RECORD_ARRAY_KEYS) {
    if (Array.isArray(raw[key])) return recordRows(raw[key]);
  }
  return [];
}

/** Summarize Hudson Rock response → hit count + newest compromise date. */
function summarize(raw: unknown): {
  totalResults: number;
  newestDate: string | null;
} {
  const rows = recordArray(raw);
  const explicitTotal = isRecord(raw) ? raw.total : undefined;
  const totalResults =
    typeof explicitTotal === "number" ? explicitTotal : rows.length;

  let newestDate: string | null = null;
  for (const row of rows) {
    for (const key of DATE_KEYS) {
      const candidate = asString(row[key]);
      if (candidate && (newestDate === null || candidate > newestDate)) {
        newestDate = candidate;
      }
    }
  }
  return { totalResults, newestDate };
}

/**
 * Hudson Rock Cavalier lookup (email / IP / domain).
 * POST https://api.hudsonrock.com/json/v3/{search-by-login/emails|search-by-ip|search-by-domain}
 * Header `api-key`.
 * @see https://docs.hudsonrock.com/reference/search-by-domains
 */

interface HudsonrockOptions {
  userAgent?: string;
}

export function fetchHudsonrockLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: HudsonrockOptions
): Effect.Effect<HudsonrockLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchHudsonrockLookupGen() {
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "HUDSONROCK_API_KEY" });
    }

    const { kind, value } = yield* Effect.try({
      try: () => classifyHudsonrockQuery(queryRaw),
      catch: mapToolsCatch,
    });
    const ua =
      options?.userAgent ?? watchdogUserAgent("breach.hudsonrock.lookup");

    let path: string;
    let body: Record<string, unknown>;
    switch (kind) {
      case "email": {
        path = "/search-by-login/emails";
        body = { logins: [value] };
        break;
      }
      case "ip": {
        path = "/search-by-ip";
        body = { ips: [value] };
        break;
      }
      case "domain": {
        path = "/search-by-domain";
        body = { domains: [value] };
        break;
      }
      default: {
        const _exhaustive: never = kind;
        return yield* new ValidationVendorError({
          message: `Unhandled Hudson Rock query kind: ${String(_exhaustive)}`,
        });
      }
    }

    const { status, body: raw } = yield* fetchJsonUnknownEffect({
      url: `${BASE_URL}${path}`,
      signal,
      service: "Hudson Rock",
      subject: value,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "api-key": key,
          "User-Agent": ua,
        },
        body: JSON.stringify(body),
      },
    });

    if (status === 404) {
      return hudsonrockLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "api.hudsonrock.com",
        found: false,
        totalResults: 0,
        newestDate: null,
      });
    }

    const { totalResults, newestDate } = summarize(raw);

    return hudsonrockLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "api.hudsonrock.com",
      found: totalResults > 0,
      totalResults,
      newestDate,
    });
  });
}
