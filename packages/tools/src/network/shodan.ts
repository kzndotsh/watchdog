import { z } from "zod";

import { ParseVendorError } from "../errors/tagged-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { normalizeIp } from "../normalize";

export const shodanLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  status: z.number().int().nullable(),
  org: z.string().nullable(),
  isp: z.string().nullable(),
  asn: z.string().nullable(),
  hostnames: z.array(z.string()),
  ports: z.array(z.number().int()),
  tags: z.array(z.string()),
  os: z.string().nullable(),
  countryCode: z.string().nullable(),
  city: z.string().nullable(),
  lastUpdate: z.string().nullable(),
});

export type ShodanLookupSnapshot = z.infer<typeof shodanLookupSnapshotSchema>;

/**
 * Shodan host lookup — GET /shodan/host/{ip}?key=&minify=true
 * @see https://developer.shodan.io/api
 */

type ShodanOptions = {
  userAgent: string;
};

const optionalString = z.string().nullish();

/** Fields read from Shodan's minified host body; a wrong type is a vendor parse failure. */
const shodanHostBodySchema = z.object({
  org: optionalString,
  isp: optionalString,
  asn: optionalString,
  hostnames: z.array(z.string()).nullish(),
  ports: z.array(z.number().int()).nullish(),
  tags: z.array(z.string()).nullish(),
  os: optionalString,
  country_code: optionalString,
  city: optionalString,
  last_update: optionalString,
});

function snapshotFromBody(
  ip: string,
  queriedAt: string,
  status: number,
  body: Record<string, unknown>
): ShodanLookupSnapshot | undefined {
  const parsed = shodanHostBodySchema.safeParse(body);
  if (!parsed.success) return undefined;
  const host = parsed.data;
  const snapshot = shodanLookupSnapshotSchema.safeParse({
    ip,
    queriedAt,
    found: true,
    status,
    org: host.org ?? null,
    isp: host.isp ?? null,
    asn: host.asn ?? null,
    hostnames: host.hostnames ?? [],
    ports: host.ports ?? [],
    tags: host.tags ?? [],
    os: host.os ?? null,
    countryCode: host.country_code ?? null,
    city: host.city ?? null,
    lastUpdate: host.last_update ?? null,
  });
  return snapshot.success ? snapshot.data : undefined;
}

export const fetchShodanHostEffect = defineJsonProvider({
  service: "Shodan",
  schema: shodanLookupSnapshotSchema,
  key: { query: "key" },
  normalize: normalizeIp,
  request: (ip, _options: ShodanOptions) => {
    const url = new URL(
      `https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}`
    );
    url.searchParams.set("minify", "true");
    return { url };
  },
  notFound: ({ subject: ip, queriedAt }) => ({
    ip,
    queriedAt,
    found: false,
    status: 404,
    org: null,
    isp: null,
    asn: null,
    hostnames: [],
    ports: [],
    tags: [],
    os: null,
    countryCode: null,
    city: null,
    lastUpdate: null,
  }),
  toSnapshot: ({ subject: ip, queriedAt, status, body }) => {
    const snapshot = snapshotFromBody(ip, queriedAt, status, body);
    if (snapshot === undefined) {
      throw new ParseVendorError({ service: "Shodan", subject: ip });
    }
    return snapshot;
  },
});
