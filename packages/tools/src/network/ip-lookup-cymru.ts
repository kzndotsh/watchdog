import { isIP } from "node:net";

import { validationToolsError } from "../errors/tools-error";

export function stripTxtQuotes(s: string): string {
  return s.replaceAll(/^"|"$/g, "").trim();
}

export function expandIpv6(ip: string): string {
  const parts = ip.split("::");
  if (parts.length > 2) throw validationToolsError(`Invalid IPv6: ${ip}`);
  const head =
    parts[0] !== undefined && parts[0] !== "" ? parts[0].split(":") : [];
  const tail =
    parts[1] !== undefined && parts[1] !== "" ? parts[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  const full = [
    ...head,
    ...Array.from({ length: Math.max(missing, 0) }, () => "0"),
    ...tail,
  ];
  if (full.length !== 8) throw validationToolsError(`Invalid IPv6: ${ip}`);
  return full.map((h) => h.padStart(4, "0")).join(":");
}

export function originLookupName(ip: string): string {
  const ver = isIP(ip);
  if (ver === 4) {
    // oxlint-disable-next-line unicorn/no-array-reverse -- toReversed() needs ES2023 lib, unavailable in consumers' tsconfig target; split() already returns a fresh, unshared array so reversing in place is safe
    const reversed = ip.split(".").reverse();
    return `${reversed.join(".")}.origin.asn.cymru.com`;
  }
  if (ver === 6) {
    const hex = expandIpv6(ip).replaceAll(":", "");
    // oxlint-disable-next-line typescript/no-misused-spread -- hex nibbles are ASCII-only, safe to iterate by code point
    const nibbleChars = [...hex];
    // oxlint-disable-next-line unicorn/no-array-reverse -- see reasoning above; nibbleChars is a fresh, unshared array
    const nibbles = nibbleChars.reverse().join(".");
    return `${nibbles}.origin6.asn.cymru.com`;
  }
  throw validationToolsError(`Invalid IP address: ${ip}`);
}

export interface CymruOriginFields {
  asns: string[];
  bgpPrefix: string | null;
  countryCode: string | null;
  registry: string | null;
  allocated: string | null;
}

export function parseCymruOriginTxt(rawOrigin: string): CymruOriginFields {
  const parts = rawOrigin.split("|").map((p) => p.trim());
  const asns = (parts[0] ?? "")
    .split(/\s+/)
    .map((a) => a.trim())
    .filter(Boolean);
  return {
    asns,
    bgpPrefix: parts[1] || null,
    countryCode: parts[2] || null,
    registry: parts[3] || null,
    allocated: parts[4] || null,
  };
}

export function parseCymruAsName(rawAs: string): string | null {
  const asParts = rawAs.split("|").map((p) => p.trim());
  return asParts[4] || null;
}
