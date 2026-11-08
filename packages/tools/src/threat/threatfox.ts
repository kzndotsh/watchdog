import { z } from "zod";

import { ValidationVendorError } from "../errors/tagged-errors";
import { defineJsonProvider } from "../http/define-json-provider";
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

type ThreatfoxOptions = {
  userAgent: string;
};

export const fetchThreatfoxLookupEffect = defineJsonProvider({
  service: "ThreatFox",
  schema: threatfoxLookupSnapshotSchema,
  key: { header: "Auth-Key" },
  normalize: (raw) => {
    const classified = classifyQuery(raw);
    if (classified.value === "") {
      throw new ValidationVendorError({ message: "query required" });
    }
    return classified;
  },
  request: ({ value }, _options: ThreatfoxOptions) => ({
    url: "https://threatfox-api.abuse.ch/api/v1/",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "search_ioc",
      search_term: value,
      exact_match: true,
    }),
  }),
  toSnapshot: ({ subject: { kind, value }, queriedAt, body }) => {
    const queryStatus =
      typeof body.query_status === "string" ? body.query_status : "unknown";

    if (queryStatus === "no_result") {
      return {
        query: value,
        kind,
        queriedAt,
        source: "threatfox-api.abuse.ch" as const,
        queryStatus,
        found: false,
        iocs: [],
      };
    }

    if (queryStatus !== "ok") {
      throw new ValidationVendorError({
        message: "ThreatFox query failed",
        cause: `query_status=${queryStatus}`,
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

    return {
      query: value,
      kind,
      queriedAt,
      source: "threatfox-api.abuse.ch" as const,
      queryStatus,
      found: true,
      iocs,
    };
  },
});
