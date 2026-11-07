import { isIP } from "node:net";

import { compressIpv6 } from "@watchdog/schemas/ip";

import { validationVendorError } from "../errors/vendor-errors";

/** Validate an IPv4/IPv6 literal and return its canonical form (v4 trimmed, v6 lowercase RFC 5952). */
export function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  const version = isIP(trimmed);
  if (version === 4) return trimmed;
  if (version === 6) return compressIpv6(trimmed);
  throw validationVendorError(`Invalid IP address: ${raw}`);
}
