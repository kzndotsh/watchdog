import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import { parseEgressProxyUrl } from "@watchdog/env/egress-proxy";

import { BlockedTargetError } from "../errors/tagged-errors";
import { isBlockedAddress, isBlockedHostName } from "./blocked-address";

/** One resolved address of a host name. */
export type ResolvedAddress = {
  readonly address: string;
  readonly family: 4 | 6;
};

/** Resolves every A and AAAA record of a host name. Injectable for tests. */
export type HostResolver = (
  host: string
) => Promise<readonly ResolvedAddress[]>;

/** True when an address must be refused. Injectable for tests. */
export type AddressPolicy = (address: string) => boolean;

/** System resolver, every record, in the order the OS returns them. */
export const systemResolver: HostResolver = async (host) => {
  const records = await dnsLookup(host, { all: true, order: "verbatim" });
  return records.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
};

export function bareHost(url: URL): string {
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "");
}

/** Refuses a URL that is not http(s). */
export function assertHttpScheme(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedTargetError({ reason: "scheme" });
  }
}

/**
 * Checks everything about a target that needs no lookup: the scheme, a
 * literal IP host, and host names that are loopback by definition. Host names
 * that need resolving are checked at connect time by `createSafeLookup`.
 */
export function assertAllowedTarget(
  url: URL,
  isBlocked: AddressPolicy = isBlockedAddress
): void {
  assertHttpScheme(url);
  const host = bareHost(url);
  if (isIP(host) === 0) {
    if (host === "" || isBlockedHostName(host)) {
      throw new BlockedTargetError({ reason: "host" });
    }
    return;
  }
  if (isBlocked(host)) throw new BlockedTargetError({ reason: "address" });
}

async function validatedAddresses(
  resolve: HostResolver,
  isBlocked: AddressPolicy,
  hostname: string,
  family: number | string | undefined
): Promise<readonly ResolvedAddress[]> {
  const records = await resolve(hostname);
  if (records.length === 0 || records.some((r) => isBlocked(r.address))) {
    throw new BlockedTargetError({ reason: "resolved" });
  }
  const wanted = family === 4 || family === 6 ? family : 0;
  const usable =
    wanted === 0 ? records : records.filter((r) => r.family === wanted);
  if (usable.length === 0) throw new BlockedTargetError({ reason: "resolved" });
  return usable;
}

/** Hands `error` to a lookup callback that already threw; a second throw is dropped. */
function tellOnce(
  callback: Parameters<LookupFunction>[2],
  error: unknown
): void {
  try {
    // oxlint-disable-next-line promise/prefer-await-to-callbacks, node/callback-return -- Node's `dns.lookup` hook contract is callback-based; this is the one extra call, guarded so it cannot throw out
    callback(error instanceof Error ? error : new Error(String(error)), "", 0);
  } catch {
    // The callback threw twice: nothing is left to notify.
  }
}

/**
 * The `lookup` hook of the connection: resolves the name, refuses the
 * connection when ANY returned address is blocked, and otherwise hands the
 * socket the validated addresses. The socket connects to what this function
 * returned, so there is no second resolution between check and connect.
 */
export function createSafeLookup(
  resolve: HostResolver = systemResolver,
  isBlocked: AddressPolicy = isBlockedAddress
): LookupFunction {
  /* oxlint-disable promise/prefer-await-to-callbacks -- Node's `lookup` contract is callback-based */
  async function answer(
    ...[hostname, options, callback]: Parameters<LookupFunction>
  ): Promise<void> {
    let reply: Parameters<typeof callback>;
    try {
      const usable = await validatedAddresses(
        resolve,
        isBlocked,
        hostname,
        options.family
      );
      const [first] = usable;
      reply =
        options.all === true || first === undefined
          ? [null, usable.map(({ address, family }) => ({ address, family }))]
          : [null, first.address, first.family];
    } catch (error: unknown) {
      reply = [
        error instanceof Error ? error : new Error(String(error)),
        "",
        0,
      ];
    }
    callback(...reply);
  }
  return (hostname, options, callback) => {
    // A callback that throws is told once more, with that error (what the old
    // promise chain did); a second throw has nowhere to go and must not become an
    // unhandled rejection, which would end the worker or the web server.
    answer(hostname, options, callback).catch((error: unknown) => {
      // oxlint-disable-next-line promise/no-callback-in-promise -- the lookup callback must be invoked from this async path; tellOnce guarantees a single extra call that cannot throw out
      tellOnce(callback, error);
    });
  };
  /* oxlint-enable promise/prefer-await-to-callbacks */
}

/** `lookup` for sockets that are not HTTP (TLS audit), default policy. */
export const safeSocketLookup: LookupFunction = createSafeLookup();

/** Throws `BlockedTargetError` for a bare host or IP the default policy refuses, without a lookup. */
export function assertAllowedHost(host: string): void {
  const bare = host.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(bare) !== 0) {
    if (isBlockedAddress(bare)) {
      throw new BlockedTargetError({ reason: "address" });
    }
    return;
  }
  if (bare === "" || isBlockedHostName(bare)) {
    throw new BlockedTargetError({ reason: "host" });
  }
}

/**
 * Best-effort local check used when an egress proxy connects on our behalf: the
 * name is resolved here and refused when any answer is not public. A resolution
 * failure is not a refusal (the proxy may resolve names this host cannot), so
 * the request proceeds to the proxy.
 */
export async function assertResolvesPublic(
  host: string,
  resolve: HostResolver,
  isBlocked: AddressPolicy
): Promise<void> {
  if (isIP(host) !== 0) return;
  let records: readonly ResolvedAddress[];
  try {
    records = await resolve(host);
  } catch {
    return;
  }
  if (records.some((record) => isBlocked(record.address))) {
    throw new BlockedTargetError({ reason: "resolved" });
  }
}

/** The proxy URL, or a typed refusal when the setting is not an http(s) URL. */
export function requireProxyUrl(raw: string): URL {
  const proxy = parseEgressProxyUrl(raw);
  if (proxy === null) throw new BlockedTargetError({ reason: "proxy" });
  return proxy;
}

/** Optional egress proxy from `WD_EGRESS_PROXY`; blank means none. */
export function egressProxyFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const raw = env.WD_EGRESS_PROXY?.trim();
  return raw === undefined || raw === "" ? undefined : raw;
}
