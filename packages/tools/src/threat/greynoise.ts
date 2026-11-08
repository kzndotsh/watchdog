import { z } from "zod";

import { HttpVendorError } from "../errors/tagged-errors";
import {
  defineJsonProvider,
  type JsonProviderContext,
} from "../http/define-json-provider";
import { normalizeIp } from "../normalize";
import { asBool, asString } from "../parse/coerce";

export const greynoiseLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("api.greynoise.io/v3/community"),
  found: z.boolean(),
  noise: z.boolean().nullable(),
  riot: z.boolean().nullable(),
  classification: z.string().nullable(),
  name: z.string().nullable(),
  link: z.string().nullable(),
  lastSeen: z.string().nullable(),
  message: z.string().nullable(),
  authenticated: z.boolean(),
});

export type GreynoiseLookupSnapshot = z.infer<
  typeof greynoiseLookupSnapshotSchema
>;

/**
 * GreyNoise Community IP enrichment.
 * GET https://api.greynoise.io/v3/community/{ip}
 * Optional API key via header `key`.
 * @see https://docs.greynoise.io/reference/get_v3-community-ip
 */

type GreynoiseOptions = {
  apiKey?: string;
  userAgent: string;
};

function greynoiseSnapshot({
  subject: ip,
  queriedAt,
  status,
  body,
  options,
}: JsonProviderContext<string, GreynoiseOptions>) {
  return {
    ip,
    queriedAt,
    source: "api.greynoise.io/v3/community" as const,
    found: status === 200,
    noise: asBool(body.noise),
    riot: asBool(body.riot),
    classification: asString(body.classification),
    name: asString(body.name),
    link: asString(body.link),
    lastSeen: asString(body.last_seen),
    message: asString(body.message),
    authenticated: Boolean(options.apiKey?.trim()),
  };
}

const lookupGreynoiseCommunity = defineJsonProvider({
  service: "GreyNoise",
  schema: greynoiseLookupSnapshotSchema,
  key: { header: "key" },
  normalize: normalizeIp,
  request: (ip, _options: GreynoiseOptions) => ({
    url: `https://api.greynoise.io/v3/community/${encodeURIComponent(ip)}`,
  }),
  // A 404 carries the vendor's own message for an unseen IP, so both statuses build the same way.
  notFound: (ctx) => greynoiseSnapshot(ctx),
  toSnapshot: (ctx) => {
    // Only 200 is a hit; any other 2xx is not a community answer.
    if (ctx.status !== 200) {
      throw new HttpVendorError({ service: "GreyNoise", status: ctx.status });
    }
    return greynoiseSnapshot(ctx);
  },
});

export function fetchGreynoiseCommunityEffect(
  ipRaw: string,
  signal: AbortSignal,
  options: GreynoiseOptions
) {
  return lookupGreynoiseCommunity(
    ipRaw,
    options.apiKey?.trim() ?? "",
    signal,
    options
  );
}
