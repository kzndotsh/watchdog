import { z } from "zod";

import {
  defineJsonProvider,
  pick,
  type Field,
} from "../http/define-json-provider";
import { normalizeIp } from "../normalize";
import { asBool, asString } from "../parse/coerce";

export const ipinfoLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("ipinfo.io"),
  found: z.boolean(),
  hostname: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  loc: z.string().nullable(),
  org: z.string().nullable(),
  postal: z.string().nullable(),
  timezone: z.string().nullable(),
});

export type IpinfoLookupSnapshot = z.infer<typeof ipinfoLookupSnapshotSchema>;

/**
 * IPinfo.io GeoIP + org lookup (classic free-tier compatible endpoint).
 * GET https://ipinfo.io/{ip}/json?token=KEY
 * @see https://ipinfo.io/developers
 */

type IpinfoOptions = {
  userAgent: string;
};

/** Trimmed, blank is `null`: how this vendor's text fields were always read. */
const trimmed: Field<string | null> = { read: asString };

export const fetchIpinfoLookupEffect = defineJsonProvider({
  service: "IPinfo",
  schema: ipinfoLookupSnapshotSchema,
  key: { query: "token" },
  normalize: normalizeIp,
  request: (ip, _options: IpinfoOptions) => ({
    url: `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
  }),
  toSnapshot: ({ subject: ip, queriedAt, body }) => ({
    ip,
    queriedAt,
    source: "ipinfo.io" as const,
    found: asBool(body.bogon) !== true,
    ...pick(body, {
      hostname: trimmed,
      city: trimmed,
      region: trimmed,
      country: trimmed,
      loc: trimmed,
      org: trimmed,
      postal: trimmed,
      timezone: trimmed,
    }),
  }),
});
