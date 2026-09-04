import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";

import { mapToolsCatch } from "../errors/map-tools-tag";
import { HttpVendorError, type ToolsTag } from "../errors/tagged-errors";
import { parseToolsError } from "../errors/tools-error";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchBytesEffect } from "../http/fetch-bytes";
import { asStringEmpty as asString, isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";
import {
  ctCertEntrySchema,
  ctLookupSnapshotSchema,
  type CtCertEntry,
  type CtLookupSnapshot,
} from "./schema";

const CRT_SH_URL = "https://crt.sh/";

/** crt.sh sometimes concatenates objects `}{` instead of a JSON array. */
export function parseCrtShJson(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const wrapped = `[${trimmed.replaceAll("}{", "},{")}]`;
    try {
      const parsed: unknown = JSON.parse(wrapped);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw parseToolsError("crt.sh", "response", "crt.sh returned non-JSON");
    }
  }
}

/** Pull host labels from crt.sh CN / SAN blobs (newline-separated). */
export function extractDomainsFromNameValue(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[\n\s,]+/)) {
    const label = part.trim();
    if (!label || label.includes(" ")) continue;
    // Skip emails that sometimes appear in name_value
    if (label.includes("@")) continue;
    try {
      out.push(normalizeHost(label.replace(/^\*\./, "")));
    } catch {
      /* skip */
    }
  }
  return out;
}

function entryFromRow(row: unknown): CtCertEntry | null {
  if (!isRecord(row)) return null;
  const commonName = asString(row.common_name);
  const nameValue = asString(row.name_value) || commonName;
  if (!commonName && !nameValue) return null;
  return ctCertEntrySchema.parse({
    commonName: commonName || nameValue.split("\n")[0] || "",
    nameValue,
    issuer: asString(row.issuer_name),
    notBefore: asString(row.not_before),
    notAfter: asString(row.not_after),
    serial: asString(row.serial_number),
  });
}

function domainMatchesHost(domain: string, normalized: string): boolean {
  return domain.endsWith(`.${normalized}`) || domain === normalized;
}

function addEntryDomains(
  domainSet: Set<string>,
  normalized: string,
  entry: CtCertEntry
): void {
  for (const d of extractDomainsFromNameValue(entry.nameValue)) {
    if (domainMatchesHost(d, normalized)) domainSet.add(d);
  }
  for (const d of extractDomainsFromNameValue(entry.commonName)) {
    if (domainMatchesHost(d, normalized)) domainSet.add(d);
  }
}

function collectCrtShEntries(
  rows: unknown[],
  normalized: string,
  limit: number
): { entries: CtCertEntry[]; domains: string[] } {
  const entries: CtCertEntry[] = [];
  const seenEntry = new Set<string>();
  const domainSet = new Set<string>([normalized]);

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const entry = entryFromRow(row);
    if (entry === null) continue;
    const key = `${entry.commonName}|${entry.serial}|${entry.notBefore}`;
    if (seenEntry.has(key)) continue;
    seenEntry.add(key);
    entries.push(entry);
    addEntryDomains(domainSet, normalized, entry);
    if (entries.length >= limit) break;
  }

  return {
    entries,
    domains: [...domainSet].sort((a, b) => a.localeCompare(b)),
  };
}

export interface FetchCrtShOptions {
  /** Max cert rows to keep after dedupe (default 50). */
  limit?: number;
  userAgent?: string;
}

/**
 * Query crt.sh Certificate Transparency for `%.{host}` (and the bare host).
 * Returns structured entries + deduped domain labels — no Cap/Graph types.
 */
export function fetchCrtShLookupEffect(
  host: string,
  signal?: AbortSignal,
  options?: FetchCrtShOptions
): Effect.Effect<CtLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchCrtShLookupGen() {
    const resolved = options ?? {};
    const normalized = normalizeHost(host);
    const limit = resolved.limit ?? 50;
    const userAgent =
      resolved.userAgent ?? watchdogUserAgent("network.ct.lookup");

    const url = new URL(CRT_SH_URL);
    url.searchParams.set("q", `%.${normalized}`);
    url.searchParams.set("output", "json");

    const abort = signal ?? new AbortController().signal;
    const result = yield* fetchBytesEffect(url.toString(), abort, {
      userAgent,
      maxBytes: 4_000_000,
      accept: "application/json",
    });
    if (!result.ok) {
      return yield* new HttpVendorError({
        service: "crt.sh",
        status: result.status,
      });
    }

    const payloadText = new TextDecoder().decode(result.bytes);
    const rows = yield* Effect.try({
      try: () => parseCrtShJson(payloadText),
      catch: mapToolsCatch,
    });
    const { entries, domains } = collectCrtShEntries(rows, normalized, limit);

    return ctLookupSnapshotSchema.parse({
      host: normalized,
      source: "crt.sh",
      queriedAt: new Date().toISOString(),
      entries,
      domains,
    });
  });
}
