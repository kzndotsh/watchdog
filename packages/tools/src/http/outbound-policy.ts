import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

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

function bareHost(url: URL): string {
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "");
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
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedTargetError({ reason: "scheme" });
  }
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
    throw new BlockedTargetError({ reason: "address" });
  }
  const wanted = family === 4 || family === 6 ? family : 0;
  const usable =
    wanted === 0 ? records : records.filter((r) => r.family === wanted);
  if (usable.length === 0) throw new BlockedTargetError({ reason: "address" });
  return usable;
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
  /* oxlint-disable promise/prefer-await-to-callbacks, promise/no-callback-in-promise -- Node's `lookup` contract is callback-based */
  return (hostname, options, callback) => {
    validatedAddresses(resolve, isBlocked, hostname, options.family)
      .then((usable) => {
        const [first] = usable;
        if (options.all === true || first === undefined) {
          callback(
            null,
            usable.map(({ address, family }) => ({ address, family }))
          );
          return;
        }
        callback(null, first.address, first.family);
      })
      .catch((error: unknown) => {
        callback(
          error instanceof Error ? error : new Error(String(error)),
          "",
          0
        );
      });
  };
  /* oxlint-enable promise/prefer-await-to-callbacks, promise/no-callback-in-promise */
}

/** `lookup` for sockets that are not HTTP (TLS audit), default policy. */
export const safeSocketLookup: LookupFunction = createSafeLookup();

/** Throws `BlockedTargetError` for a bare host or IP the default policy refuses, without a lookup. */
export function assertAllowedHost(host: string): void {
  const bare = host.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (bare === "" || isBlockedHostName(bare)) {
    throw new BlockedTargetError({ reason: "host" });
  }
  if (isIP(bare) !== 0 && isBlockedAddress(bare)) {
    throw new BlockedTargetError({ reason: "address" });
  }
}

/** Optional egress proxy from `WD_EGRESS_PROXY`; blank means none. */
export function egressProxyFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const raw = env.WD_EGRESS_PROXY?.trim();
  return raw === undefined || raw === "" ? undefined : raw;
}
