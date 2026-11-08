import { isIP, isIPv4 } from "node:net";

import { z } from "zod";

import { defineJsonProvider } from "../http/define-json-provider";
import {
  assertHttpUrlScheme,
  normalizeHttpUrl,
} from "../http/normalize-http-url";
import { normalizeHost, normalizeIp } from "../normalize";
import { asString, isRecord, recordRows } from "../parse/coerce";

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

type OtxType = "IPv4" | "IPv6" | "domain" | "file";

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
    const value = normalizeIp(trimmed);
    return {
      kind: "ip",
      otxType: isIPv4(value) ? "IPv4" : "IPv6",
      value,
    };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    assertHttpUrlScheme(trimmed);
    const hostname = new URL(normalizeHttpUrl(trimmed)).hostname;
    if (isIP(hostname)) {
      const value = normalizeIp(hostname);
      return {
        kind: "url",
        otxType: isIPv4(value) ? "IPv4" : "IPv6",
        value,
      };
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

type OtxOptions = {
  userAgent: string;
};

export const fetchOtxLookupEffect = defineJsonProvider({
  service: "OTX",
  schema: otxLookupSnapshotSchema,
  key: { header: "X-OTX-API-KEY" },
  normalize: classifyOtxIndicator,
  request: ({ otxType, value }, _options: OtxOptions) => ({
    url: `https://otx.alienvault.com/api/v1/indicators/${otxType}/${encodeURIComponent(value)}/general`,
  }),
  notFound: ({ subject: { kind, value }, queriedAt }) => ({
    query: value,
    kind,
    queriedAt,
    source: "otx.alienvault.com" as const,
    found: false,
    pulseCount: 0,
    pulseNames: [],
    malwareFamilies: [],
  }),
  toSnapshot: ({ subject: { kind, value }, queriedAt, body }) => ({
    query: value,
    kind,
    queriedAt,
    source: "otx.alienvault.com" as const,
    found: true,
    ...extractPulseInfo(body),
  }),
});
