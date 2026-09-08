import { isIP, isIPv4 } from "node:net";

import { expandIpv6 } from "../network/ip-lookup-cymru";

function parseUrlHostname(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  } catch {
    return null;
  }
}

function isBlockedHostname(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost");
}

function embeddedIpv4FromMapped(host: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  if (dotted?.[1] !== undefined && isIP(dotted[1]) === 4) {
    return dotted[1];
  }

  try {
    const expanded = expandIpv6(host.toLowerCase());
    const parts = expanded
      .split(":")
      .map((hextet) => Number.parseInt(hextet, 16));
    if (parts.length !== 8 || parts[5] !== 0xff_ff) return null;
    const embedded = (parts[6] ?? 0) * 65_536 + (parts[7] ?? 0);
    const octets = [
      Math.floor(embedded / 16_777_216),
      Math.floor(embedded / 65_536) % 256,
      Math.floor(embedded / 256) % 256,
      embedded % 256,
    ];
    const v4 = octets.join(".");
    return isIP(v4) === 4 ? v4 : null;
  } catch {
    return null;
  }
}

function isBlockedIpv6(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;

  try {
    const expanded = expandIpv6(lower);
    if (expanded === "0000:0000:0000:0000:0000:0000:0000:0001") {
      return true;
    }
    for (const hextet of expanded.split(":")) {
      const value = Number.parseInt(hextet, 16);
      if (value >= 0xfc_00 && value <= 0xfd_ff) return true;
      if (value >= 0xfe_80 && value <= 0xfe_bf) return true;
    }
  } catch {
    return false;
  }
  return false;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const PRIVATE_IPV4_RULES: ((a: number, b: number) => boolean)[] = [
  (a) => a === 10 || a === 127 || a === 0,
  (a, b) => a === 169 && b === 254,
  (a, b) => a === 192 && b === 168,
  (a, b) => a === 172 && b >= 16 && b <= 31,
  (a, b) => a === 100 && b >= 64 && b <= 127,
];

function isPrivateIpv4(octets: number[]): boolean {
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  return PRIVATE_IPV4_RULES.some((rule) => rule(a, b));
}

function isBlockedIpv4(host: string): boolean {
  if (!isIPv4(host)) return false;
  return isPrivateIpv4(host.split(".").map(Number));
}

/** Block private, loopback, link-local, and CGNAT hop URLs. */
export function isBlockedUnshortenUrl(raw: string): boolean {
  const hostname = parseUrlHostname(raw);
  if (hostname === null) return true;
  const host = hostname.toLowerCase();
  if (isBlockedHostname(host)) return true;

  const embeddedIpv4 = embeddedIpv4FromMapped(host);
  if (embeddedIpv4 !== null) {
    return isBlockedIpv4(embeddedIpv4);
  }

  const ipVersion = isIP(host);
  if (ipVersion === 6) return isBlockedIpv6(host);
  if (ipVersion === 4) return isBlockedIpv4(host);
  return false;
}

export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

export function isRedirectResponse(
  status: number,
  location: string | null
): location is string {
  return location !== null && isRedirectStatus(status);
}

export function resolveRedirectUrl(current: string, location: string): string {
  return new URL(location, current).href;
}
