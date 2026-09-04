import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { createTtlCache } from "../cache/ttl-memory";
import { normalizeIp } from "../dns/reverse";
import { mapToolsCatch } from "../errors/map-tools-tag";
import { HttpVendorError, type ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchBytesEffect } from "../http/fetch-bytes";

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

/** Exported for unit tests — same parser used by fetchTorExitLookup. */
export function parseExitAddresses(text: string): Set<string> {
  const ips = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^ExitAddress\s+(\S+)/.exec(line.trim());
    const candidate = match?.[1];
    if (!candidate) continue;
    try {
      ips.add(normalizeIp(candidate));
    } catch {
      /* skip malformed entries */
    }
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
    const ip = yield* Effect.try({
      try: () => normalizeIp(ipRaw),
      catch: mapToolsCatch,
    });
    const ua =
      options?.userAgent ?? watchdogUserAgent("network.tor_exit.lookup");

    const exits = yield* fetchExitAddressesEffect(signal, ua);

    return torExitLookupSnapshotSchema.parse({
      ip,
      queriedAt: new Date().toISOString(),
      source: "check.torproject.org",
      isExit: exits.has(ip),
    });
  });
}
