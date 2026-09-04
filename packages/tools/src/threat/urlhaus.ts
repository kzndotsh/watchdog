import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { classifyIpOrHost } from "../parse/classify-ip-or-host";
import { asString, isRecord } from "../parse/coerce";

export const urlhausLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["url", "host", "hash"]),
  queriedAt: z.string().min(1),
  source: z.literal("urlhaus-api.abuse.ch"),
  queryStatus: z.string(),
  found: z.boolean(),
  threat: z.string().nullable(),
  urlStatus: z.string().nullable(),
  tags: z.array(z.string()),
  urlhausReference: z.string().nullable(),
  firstSeen: z.string().nullable(),
});

export type UrlhausLookupSnapshot = z.infer<typeof urlhausLookupSnapshotSchema>;

const HASH_RE = /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{64}$/;

function classifyQuery(raw: string): {
  kind: "url" | "host" | "hash";
  value: string;
} {
  const trimmed = raw.trim();
  if (HASH_RE.test(trimmed))
    return { kind: "hash", value: trimmed.toLowerCase() };
  if (/^https?:\/\//i.test(trimmed)) return { kind: "url", value: trimmed };
  try {
    const classified = classifyIpOrHost(trimmed);
    return { kind: "host", value: classified.value };
  } catch {
    return { kind: "host", value: trimmed };
  }
}

function emptyResult(
  kind: "url" | "host" | "hash",
  value: string,
  queryStatus: string
) {
  return {
    query: value,
    kind,
    queriedAt: new Date().toISOString(),
    source: "urlhaus-api.abuse.ch" as const,
    queryStatus,
    found: false,
    threat: null,
    urlStatus: null,
    tags: [],
    urlhausReference: null,
    firstSeen: null,
  };
}

/**
 * URLhaus (abuse.ch) malicious URL / host / payload search.
 * POST …/v1/{url,host,payload}/ with Auth-Key header. Never downloads samples.
 * @see https://urlhaus-api.abuse.ch/
 */

interface UrlhausOptions {
  userAgent?: string;
}

export function fetchUrlhausLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: UrlhausOptions
): Effect.Effect<UrlhausLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchUrlhausLookupGen() {
    const { kind, value } = classifyQuery(queryRaw);
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "THREATFOX_API_KEY" });
    }

    const ua = options?.userAgent ?? watchdogUserAgent("threat.urlhaus.lookup");

    let endpoint: "url" | "payload" | "host";
    if (kind === "url") {
      endpoint = "url";
    } else if (kind === "hash") {
      endpoint = "payload";
    } else {
      endpoint = "host";
    }
    const body = new URLSearchParams();
    if (kind === "url") {
      body.set("url", value);
    } else if (kind === "host") {
      body.set("host", value);
    } else {
      body.set(value.length === 64 ? "sha256_hash" : "md5_hash", value);
    }

    const { body: raw } = yield* fetchJsonObjectEffect({
      url: `https://urlhaus-api.abuse.ch/v1/${endpoint}/`,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "Auth-Key": key,
          "User-Agent": ua,
        },
        body,
      },
      signal,
      service: "URLhaus",
      subject: value,
    });
    const queryStatus = asString(raw.query_status) ?? "unknown";

    if (queryStatus !== "ok") {
      return urlhausLookupSnapshotSchema.parse(
        emptyResult(kind, value, queryStatus)
      );
    }

    if (kind === "url") {
      const tags = Array.isArray(raw.tags)
        ? raw.tags.filter((t): t is string => typeof t === "string")
        : [];
      return urlhausLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "urlhaus-api.abuse.ch",
        queryStatus,
        found: true,
        threat: asString(raw.threat),
        urlStatus: asString(raw.url_status),
        tags,
        urlhausReference: asString(raw.urlhaus_reference),
        firstSeen: asString(raw.date_added),
      });
    }

    if (kind === "host") {
      const urls = Array.isArray(raw.urls) ? raw.urls : [];
      const first = urls.find(isRecord);
      const tags =
        first && Array.isArray(first.tags)
          ? first.tags.filter((t): t is string => typeof t === "string")
          : [];
      return urlhausLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "urlhaus-api.abuse.ch",
        queryStatus,
        found: urls.length > 0,
        threat: first ? asString(first.threat) : null,
        urlStatus: first ? asString(first.url_status) : null,
        tags,
        urlhausReference: first ? asString(first.urlhaus_reference) : null,
        firstSeen: asString(raw.firstseen),
      });
    }

    // payload / hash lookup — MalwareBazaar-style single record, no per-URL fields.
    return urlhausLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "urlhaus-api.abuse.ch",
      queryStatus,
      found: true,
      threat: asString(raw.signature),
      urlStatus: null,
      tags: [],
      urlhausReference: null,
      firstSeen: asString(raw.firstseen),
    });
  });
}
