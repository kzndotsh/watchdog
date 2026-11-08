import { z } from "zod";

import { defineJsonProvider } from "../http/define-json-provider";
import { whoisSnapshotSchema, type WhoisSnapshot } from "./schema";
import { normalizeWhoisHost, parseWhoisDate, whoisStatusList } from "./shared";

const whoisXmlResponseSchema = z.object({
  WhoisRecord: z
    .object({
      registrarName: z.string().optional(),
      createdDate: z.string().optional(),
      expiresDate: z.string().optional(),
      registryData: z
        .object({
          registrarName: z.string().optional(),
          createdDate: z.string().optional(),
          expiresDate: z.string().optional(),
        })
        .optional(),
      registrant: z
        .object({
          organization: z.string().optional(),
          name: z.string().optional(),
        })
        .optional(),
      nameServers: z
        .object({ hostNames: z.array(z.string()).optional() })
        .optional(),
      status: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .optional(),
});

function whoisXmlDates(
  rec: NonNullable<z.infer<typeof whoisXmlResponseSchema>["WhoisRecord"]>
): { registeredAt: string | null; expiresAt: string | null } {
  const registry = rec.registryData;
  return {
    registeredAt:
      parseWhoisDate(rec.createdDate) ?? parseWhoisDate(registry?.createdDate),
    expiresAt:
      parseWhoisDate(rec.expiresDate) ?? parseWhoisDate(registry?.expiresDate),
  };
}

function pickWhoisField(
  primary: string | undefined,
  fallback: string | undefined
): string | null {
  return primary ?? fallback ?? null;
}

function whoisXmlSnapshot(
  host: string,
  raw: z.infer<typeof whoisXmlResponseSchema>
): WhoisSnapshot {
  const rec = raw.WhoisRecord ?? {};
  const registry = rec.registryData;
  const dates = whoisXmlDates(rec);
  const registrant = rec.registrant;
  return {
    host,
    source: "whoisxml",
    registrar: pickWhoisField(rec.registrarName, registry?.registrarName),
    registrantOrg: pickWhoisField(registrant?.organization, registrant?.name),
    nameservers: rec.nameServers?.hostNames ?? [],
    status: whoisStatusList(rec.status),
    registeredAt: dates.registeredAt,
    expiresAt: dates.expiresAt,
    raw,
  };
}

export const fetchWhoisXmlEffect = defineJsonProvider({
  service: "WhoisXML",
  schema: whoisSnapshotSchema,
  key: { query: "apiKey" },
  normalize: normalizeWhoisHost,
  request: (host, _options: { userAgent: string }) => {
    const url = new URL("https://www.whoisxmlapi.com/whoisserver/WhoisService");
    url.searchParams.set("domainName", host);
    url.searchParams.set("outputFormat", "JSON");
    return { url };
  },
  toSnapshot: ({ subject: host, body }) =>
    whoisXmlSnapshot(host, whoisXmlResponseSchema.parse(body)),
});
