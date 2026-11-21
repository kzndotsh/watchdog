import { z } from "zod";

import { defineJsonProvider } from "../http/define-json-provider";
import {
  assertHttpUrlScheme,
  normalizeHttpUrl,
} from "../http/normalize-http-url";
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
  if (/^https?:\/\//i.test(trimmed)) {
    assertHttpUrlScheme(trimmed);
    return { kind: "url", value: normalizeHttpUrl(trimmed) };
  }
  const classified = classifyIpOrHost(trimmed);
  return { kind: "host", value: classified.value };
}

function emptyResult(
  kind: "url" | "host" | "hash",
  value: string,
  queryStatus: string,
  queriedAt: string
) {
  return {
    query: value,
    kind,
    queriedAt,
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

function urlhausHostUrlHasSubstance(row: Record<string, unknown>): boolean {
  const threat = asString(row.threat);
  const urlStatus = asString(row.url_status);
  const urlhausReference = asString(row.urlhaus_reference);
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === "string")
    : [];
  return (
    threat !== null ||
    urlStatus !== null ||
    urlhausReference !== null ||
    tags.length > 0
  );
}

/**
 * URLhaus (abuse.ch) malicious URL / host / payload search.
 * POST …/v1/{url,host,payload}/ with Auth-Key header. Never downloads samples.
 * @see https://urlhaus-api.abuse.ch/
 */

type UrlhausOptions = {
  userAgent: string;
};

function urlhausForm(kind: "url" | "host" | "hash", value: string) {
  if (kind === "url") return new URLSearchParams({ url: value });
  if (kind === "host") return new URLSearchParams({ host: value });
  return new URLSearchParams({
    [value.length === 64 ? "sha256_hash" : "md5_hash"]: value,
  });
}

export const fetchUrlhausLookupEffect = defineJsonProvider({
  service: "URLhaus",
  schema: urlhausLookupSnapshotSchema,
  key: { header: "Auth-Key" },
  normalize: classifyQuery,
  request: ({ kind, value }, _options: UrlhausOptions) => ({
    url: `https://urlhaus-api.abuse.ch/v1/${kind === "hash" ? "payload" : kind}/`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: urlhausForm(kind, value),
  }),
  toSnapshot: ({ subject: { kind, value }, queriedAt, body: raw }) => {
    const queryStatus = asString(raw.query_status) ?? "unknown";
    const miss = emptyResult(kind, value, queryStatus, queriedAt);
    if (queryStatus !== "ok") return miss;

    if (kind === "url") {
      const tags = Array.isArray(raw.tags)
        ? raw.tags.filter((t): t is string => typeof t === "string")
        : [];
      const threat = asString(raw.threat);
      const urlStatus = asString(raw.url_status);
      const urlhausReference = asString(raw.urlhaus_reference);
      const firstSeen = asString(raw.date_added);
      const hasHit =
        threat !== null ||
        urlStatus !== null ||
        urlhausReference !== null ||
        firstSeen !== null ||
        tags.length > 0;
      if (!hasHit) return miss;
      return {
        query: value,
        kind,
        queriedAt,
        source: "urlhaus-api.abuse.ch" as const,
        queryStatus,
        found: true,
        threat,
        urlStatus,
        tags,
        urlhausReference,
        firstSeen,
      };
    }

    if (kind === "host") {
      const urls = Array.isArray(raw.urls)
        ? raw.urls.filter(
            (row): row is Record<string, unknown> =>
              isRecord(row) && urlhausHostUrlHasSubstance(row)
          )
        : [];
      const first = urls[0];
      if (!first) return miss;
      const tags = Array.isArray(first.tags)
        ? first.tags.filter((t): t is string => typeof t === "string")
        : [];
      return {
        query: value,
        kind,
        queriedAt,
        source: "urlhaus-api.abuse.ch" as const,
        queryStatus,
        found: true,
        threat: asString(first.threat),
        urlStatus: asString(first.url_status),
        tags,
        urlhausReference: asString(first.urlhaus_reference),
        firstSeen: asString(raw.firstseen),
      };
    }

    // payload / hash lookup — MalwareBazaar-style single record, no per-URL fields.
    const threat = asString(raw.signature);
    const sha256 = asString(raw.sha256_hash);
    const md5 = asString(raw.md5_hash);
    const fileType = asString(raw.file_type);
    const firstSeen = asString(raw.firstseen);
    const hasHit =
      threat !== null ||
      sha256 !== null ||
      md5 !== null ||
      fileType !== null ||
      firstSeen !== null;
    if (!hasHit) return miss;
    return {
      query: value,
      kind,
      queriedAt,
      source: "urlhaus-api.abuse.ch" as const,
      queryStatus,
      found: true,
      threat,
      urlStatus: null,
      tags: [],
      urlhausReference: null,
      firstSeen,
    };
  },
});
