import { isIP } from "node:net";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import { mapToolsCatch } from "../errors/map-tools-tag";
import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString, isRecord, recordRows } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const otxLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["ip", "domain", "url", "hash"]),
  queriedAt: z.string().min(1),
  source: z.literal("otx.alienvault.com"),
  found: z.boolean(),
  pulseCount: z.number().int(),
  pulseNames: z.array(z.string()),
  malwareFamilies: z.array(z.string()),
});

export type OtxLookupSnapshot = z.infer<typeof otxLookupSnapshotSchema>;

const MAX_PULSES = 20;
const HASH_LENGTHS = new Set([32, 40, 64]);

type OtxType = "IPv4" | "domain" | "file";

/**
 * Classify a generic query string into an OTX indicator path type.
 * `url` inputs are resolved to their hostname and re-classified as
 * IPv4/domain — OTX's own `url` indicator type is not used here.
 */
function classifyOtxIndicator(raw: string): {
  kind: "ip" | "domain" | "url" | "hash";
  otxType: OtxType;
  value: string;
} {
  const trimmed = raw.trim();

  if (/^[a-fA-F0-9]+$/.test(trimmed) && HASH_LENGTHS.has(trimmed.length)) {
    return { kind: "hash", otxType: "file", value: trimmed.toLowerCase() };
  }

  if (isIP(trimmed)) {
    return { kind: "ip", otxType: "IPv4", value: normalizeIp(trimmed) };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let hostname: string;
    try {
      hostname = new URL(trimmed).hostname;
    } catch {
      throw validationToolsError(`Invalid URL: ${raw}`);
    }
    if (isIP(hostname)) {
      return { kind: "url", otxType: "IPv4", value: normalizeIp(hostname) };
    }
    return { kind: "url", otxType: "domain", value: normalizeHost(hostname) };
  }

  return { kind: "domain", otxType: "domain", value: normalizeHost(trimmed) };
}

function extractPulseInfo(body: Record<string, unknown>): {
  pulseCount: number;
  pulseNames: string[];
  malwareFamilies: string[];
} {
  const pulseInfo = isRecord(body.pulse_info) ? body.pulse_info : {};
  const pulses = recordRows(pulseInfo.pulses);
  const count =
    typeof pulseInfo.count === "number" ? pulseInfo.count : pulses.length;

  const pulseNames: string[] = [];
  const malwareFamilies = new Set<string>();
  for (const pulse of pulses.slice(0, MAX_PULSES)) {
    const name = asString(pulse.name);
    if (name) pulseNames.push(name);
    const families = Array.isArray(pulse.malware_families)
      ? pulse.malware_families
      : [];
    for (const family of families) {
      const display = isRecord(family)
        ? asString(family.display_name)
        : asString(family);
      if (display) malwareFamilies.add(display);
    }
  }

  return {
    pulseCount: count,
    pulseNames,
    malwareFamilies: [...malwareFamilies].slice(0, MAX_PULSES),
  };
}

/**
 * OTX (AlienVault / LevelBlue) indicator general-section lookup — pulse
 * membership + malware-family names only (no full pulse bodies).
 * GET https://otx.alienvault.com/api/v1/indicators/{type}/{value}/general
 * @see https://otx.alienvault.com/assets/static/external_api.html
 */

interface OtxOptions {
  userAgent?: string;
}

export function fetchOtxLookupEffect(
  queryRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: OtxOptions
): Effect.Effect<OtxLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchOtxLookupGen() {
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "OTX_API_KEY" });
    }

    const { kind, otxType, value } = yield* Effect.try({
      try: () => classifyOtxIndicator(queryRaw),
      catch: mapToolsCatch,
    });
    const ua = options?.userAgent ?? watchdogUserAgent("threat.otx.lookup");
    const url = `https://otx.alienvault.com/api/v1/indicators/${otxType}/${encodeURIComponent(value)}/general`;

    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "OTX",
      subject: value,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-OTX-API-KEY": key,
          "User-Agent": ua,
        },
      },
    });

    if (status === 404) {
      return otxLookupSnapshotSchema.parse({
        query: value,
        kind,
        queriedAt: new Date().toISOString(),
        source: "otx.alienvault.com",
        found: false,
        pulseCount: 0,
        pulseNames: [],
        malwareFamilies: [],
      });
    }
    const { pulseCount, pulseNames, malwareFamilies } = extractPulseInfo(body);

    return otxLookupSnapshotSchema.parse({
      query: value,
      kind,
      queriedAt: new Date().toISOString(),
      source: "otx.alienvault.com",
      found: pulseCount > 0,
      pulseCount,
      pulseNames,
      malwareFamilies,
    });
  });
}
