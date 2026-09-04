import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { normalizeIp } from "../dns/reverse";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
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

interface GreynoiseOptions {
  apiKey?: string;
  userAgent?: string;
}

export function fetchGreynoiseCommunityEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: GreynoiseOptions
): Effect.Effect<GreynoiseLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchGreynoiseCommunityGen() {
    const ip = normalizeIp(ipRaw);
    const key = options?.apiKey?.trim() ?? "";
    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.greynoise.lookup");

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": ua,
    };
    if (key) headers.key = key;

    const { body } = yield* fetchJsonObjectEffect({
      url: `https://api.greynoise.io/v3/community/${ip}`,
      init: {
        method: "GET",
        headers,
      },
      signal,
      service: "GreyNoise",
      subject: ip,
      acceptStatus: (status) => status === 200 || status === 404,
    });
    const noise = asBool(body.noise);
    const riot = asBool(body.riot);

    return greynoiseLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      source: "api.greynoise.io/v3/community",
      found: noise === true || riot === true,
      noise,
      riot,
      classification: asString(body.classification),
      name: asString(body.name),
      link: asString(body.link),
      lastSeen: asString(body.last_seen),
      message: asString(body.message),
      authenticated: Boolean(key),
    });
  });
}
