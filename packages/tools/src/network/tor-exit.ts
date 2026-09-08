import { isIP } from "node:net";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { createTtlCache } from "../cache/ttl-memory";
import { normalizeIpEffect } from "../dns/reverse";
import { HttpVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchBytesEffect } from "../http/fetch-bytes";
import { nowIsoStringEffect } from "../infra/clock";
import { expandIpv6 } from "./ip-lookup-cymru";

export const torExitLookupSnapshotSchema = z.object({
  ip: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("check.torproject.org"),
  isExit: z.boolean(),
});

export type TorExitLookupSnapshot = z.infer<typeof torExitLookupSnapshotSchema>;

const EXIT_LIST_TTL_MS = 60 * 60_000;
const EXIT_LIST_CACHE_KEY = "exit-addresses";
const exitListCache = createTtlCache<Set<string>>(EXIT_LIST_TTL_MS);

/** Normalize exit-list IPs so equivalent IPv6 spellings match. */
export function torExitIpKey(raw: string): string | null {
  const trimmed = raw.trim();
  const version = isIP(trimmed);
  if (version === 0) return null;
  if (version === 6) {
    try {
      return expandIpv6(trimmed).toLowerCase();
    } catch {
      return trimmed.toLowerCase();
    }
  }
  return trimmed;
}

/** Exported for unit tests — same parser used by fetchTorExitLookup. */
export function parseExitAddresses(text: string): Set<string> {
  const ips = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^ExitAddress\s+(\S+)/.exec(line.trim());
    const candidate = match?.[1];
    if (!candidate) continue;
    const key = torExitIpKey(candidate);
    if (key) ips.add(key);
  }
  return ips;
}

function fetchExitAddressesEffect(
  signal: AbortSignal,
  ua: string
): Effect.Effect<Set<string>, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchExitAddressesGen() {
    const cached = exitListCache.get(EXIT_LIST_CACHE_KEY);
    if (cached) return cached;

    const result = yield* fetchBytesEffect(
      "https://check.torproject.org/exit-addresses",
      signal,
      { userAgent: ua, maxBytes: 4_000_000, accept: "text/plain" }
    );
    if (!result.ok) {
      return yield* new HttpVendorError({
        service: "Tor",
        status: result.status,
      });
    }

    const ips = parseExitAddresses(new TextDecoder().decode(result.bytes));
    exitListCache.set(EXIT_LIST_CACHE_KEY, ips);
    return ips;
  });
}

/**
 * Tor exit-node membership check against the official exit-address list.
 * GET https://check.torproject.org/exit-addresses (1h in-process cache — public list, not per-IP).
 * @see https://check.torproject.org/exit-addresses
 */

interface TorExitOptions {
  userAgent?: string;
}
export function fetchTorExitLookupEffect(
  ipRaw: string,
  signal: AbortSignal,
  options?: TorExitOptions
): Effect.Effect<TorExitLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchTorExitLookupGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const ip = yield* normalizeIpEffect(ipRaw);
    const ua =
      options?.userAgent ?? watchdogUserAgent("network.tor_exit.lookup");

    const exits = yield* fetchExitAddressesEffect(signal, ua);

    return torExitLookupSnapshotSchema.parse({
      ip,
      queriedAt,
      source: "check.torproject.org",
      isExit: exits.has(torExitIpKey(ip) ?? ip),
    });
  });
}
