import { isIP } from "node:net";

/*
 * Address policy of the outbound client: an address is allowed only when it is
 * publicly routable. Everything is decided on parsed numbers, never on text, so
 * every spelling of an address (mapped, compatible, embedded, zero-compressed)
 * gets the same answer.
 */

type Cidr4 = readonly [network: number, prefix: number];

function v4(a: number, b: number, c: number, d: number): number {
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

/** IPv4 ranges that are never public. */
const BLOCKED_IPV4: readonly Cidr4[] = [
  // "this" network, unspecified
  [v4(0, 0, 0, 0), 8],
  // private
  [v4(10, 0, 0, 0), 8],
  // carrier-grade NAT
  [v4(100, 64, 0, 0), 10],
  // loopback
  [v4(127, 0, 0, 0), 8],
  // link-local, cloud metadata
  [v4(169, 254, 0, 0), 16],
  // private
  [v4(172, 16, 0, 0), 12],
  // IETF protocol assignments
  [v4(192, 0, 0, 0), 24],
  // documentation
  [v4(192, 0, 2, 0), 24],
  // deprecated 6to4 relay
  [v4(192, 88, 99, 0), 24],
  // private
  [v4(192, 168, 0, 0), 16],
  // benchmarking
  [v4(198, 18, 0, 0), 15],
  // documentation
  [v4(198, 51, 100, 0), 24],
  // documentation
  [v4(203, 0, 113, 0), 24],
  // multicast
  [v4(224, 0, 0, 0), 4],
  // reserved, limited broadcast
  [v4(240, 0, 0, 0), 4],
];

function inCidr4(address: number, [network, prefix]: Cidr4): boolean {
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) === Math.floor(network / size);
}

function parseIpv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function toGroups(part: string): number[] | null {
  if (part === "") return [];
  const groups: number[] = [];
  for (const group of part.split(":")) {
    if (!/^[\da-f]{1,4}$/i.test(group)) return null;
    groups.push(Number.parseInt(group, 16));
  }
  return groups;
}

/** Eight 16-bit groups of an IPv6 literal, or null when it does not parse. */
function parseIpv6(raw: string): number[] | null {
  const zoneAt = raw.indexOf("%");
  let text = zoneAt === -1 ? raw : raw.slice(0, zoneAt);
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted?.[1] !== undefined) {
    const embedded = parseIpv4(dotted[1]);
    if (embedded === null) return null;
    const high = Math.floor(embedded / 65_536).toString(16);
    const low = (embedded % 65_536).toString(16);
    text = `${text.slice(0, text.length - dotted[1].length)}${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = toGroups(halves[0] ?? "");
  if (head === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = toGroups(halves[1] ?? "");
  if (tail === null) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array.from<number>({ length: missing }).fill(0), ...tail];
}

function embeddedV4(high: number, low: number): number {
  return high * 65_536 + low;
}

function isBlockedIpv4Value(address: number): boolean {
  return BLOCKED_IPV4.some((cidr) => inCidr4(address, cidr));
}

function startsWith(groups: readonly number[], prefix: number[]): boolean {
  return prefix.every((value, index) => groups[index] === value);
}

/** The leading `bits` bits of a 16-bit group. */
function topBits(group: number, bits: number): number {
  return Math.floor(group / 2 ** (16 - bits));
}

function isBlockedIpv6Groups(g: readonly number[]): boolean {
  const first = g[0] ?? 0;
  const second = g[1] ?? 0;
  const embedded = embeddedV4(g[6] ?? 0, g[7] ?? 0);
  // ::/96 covers unspecified, loopback and the deprecated IPv4-compatible form.
  if (startsWith(g, [0, 0, 0, 0, 0, 0])) return true;
  // ::ffff:0:0/96 IPv4-mapped: judged by the embedded IPv4 address.
  if (startsWith(g, [0, 0, 0, 0, 0, 0xff_ff])) {
    return isBlockedIpv4Value(embedded);
  }
  // 64:ff9b::/96 NAT64: judged by the embedded IPv4 address.
  if (startsWith(g, [0x64, 0xff_9b, 0, 0, 0, 0])) {
    return isBlockedIpv4Value(embedded);
  }
  // 64:ff9b:1::/48 local-use NAT64.
  if (startsWith(g, [0x64, 0xff_9b, 1])) return true;
  // 100::/64 discard-only.
  if (startsWith(g, [0x1_00, 0, 0, 0])) return true;
  // 2001::/32 Teredo.
  if (startsWith(g, [0x20_01, 0])) return true;
  // 2001:db8::/32 documentation.
  if (startsWith(g, [0x20_01, 0x0d_b8])) return true;
  // 2002::/16 6to4: judged by the embedded IPv4 address.
  if (first === 0x20_02) {
    return isBlockedIpv4Value(embeddedV4(second, g[2] ?? 0));
  }
  // 3fff::/20 documentation.
  if (first === 0x3f_ff && topBits(second, 4) === 0) return true;
  // fc00::/7 unique-local.
  if (topBits(first, 7) === 0x7e) return true;
  // fe80::/10 link-local and fec0::/10 site-local.
  if (topBits(first, 10) === 0x3_fa || topBits(first, 10) === 0x3_fb) {
    return true;
  }
  // ff00::/8 multicast.
  return topBits(first, 8) === 0xff;
}

/**
 * True when `address` (an IPv4 or IPv6 literal, brackets and zone ids
 * tolerated) must never be connected to: loopback, unspecified, private,
 * link-local (including cloud metadata), carrier-grade NAT, unique-local,
 * multicast, reserved, documentation, and the IPv6 forms that embed an IPv4
 * address (mapped, compatible, NAT64, 6to4). Anything that does not parse as
 * an address is blocked too.
 */
export function isBlockedAddress(address: string): boolean {
  const text = address.trim().replace(/^\[/, "").replace(/\]$/, "");
  const version = isIP(text.split("%")[0] ?? text);
  if (version === 4) {
    const value = parseIpv4(text);
    return value === null || isBlockedIpv4Value(value);
  }
  if (version === 6) {
    const groups = parseIpv6(text);
    return groups === null || isBlockedIpv6Groups(groups);
  }
  return true;
}

/** Host names that are loopback by definition and never need a lookup to refuse. */
export function isBlockedHostName(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return name === "localhost" || name.endsWith(".localhost");
}
