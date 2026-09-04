import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import { MissingCredentialError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString } from "../parse/coerce";

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

interface IpinfoOptions {
  userAgent?: string;
}

export function fetchIpinfoLookupEffect(
  ipRaw: string,
  apiToken: string,
  signal: AbortSignal,
  options?: IpinfoOptions
): Effect.Effect<IpinfoLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchIpinfoLookupGen() {
    const token = apiToken.trim();
    if (!token) {
      return yield* new MissingCredentialError({ slot: "IPINFO_API_TOKEN" });
    }
    const ip = normalizeIp(ipRaw);
    const ua = options?.userAgent ?? watchdogUserAgent("network.ipinfo.lookup");

    const url = new URL(`https://ipinfo.io/${ip}/json`);
    url.searchParams.set("token", token);

    const { body } = yield* fetchJsonObjectEffect({
      url,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
      signal,
      service: "IPinfo",
      subject: ip,
    });

    return ipinfoLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      source: "ipinfo.io",
      found: typeof body.bogon !== "boolean",
      hostname: asString(body.hostname),
      city: asString(body.city),
      region: asString(body.region),
      country: asString(body.country),
      loc: asString(body.loc),
      org: asString(body.org),
      postal: asString(body.postal),
      timezone: asString(body.timezone),
    });
  });
}
