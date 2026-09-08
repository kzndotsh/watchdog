import { isIP } from "node:net";

import { expandIpv6 } from "../network/ip-lookup-cymru";
import { asString, isRecord } from "../parse/coerce";

export interface FeodoEntry {
  ipAddress: string;
  malware: string | null;
  status: string | null;
  firstSeen: string | null;
  lastOnline: string | null;
}

export function parseFeodoEntries(raw: unknown): FeodoEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: FeodoEntry[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const ipAddress = asString(row.ip_address) ?? asString(row.ip);
    if (!ipAddress) continue;
    out.push({
      ipAddress,
      malware: asString(row.malware),
      status: asString(row.status),
      firstSeen: asString(row.first_seen),
      lastOnline: asString(row.last_online),
    });
  }
  return out;
}

function feodoIpKey(raw: string): string | null {
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

export function findFeodoEntry(
  entries: readonly FeodoEntry[],
  ip: string
): FeodoEntry | undefined {
  const key = feodoIpKey(ip);
  if (key === null) return undefined;
  return entries.find((entry) => feodoIpKey(entry.ipAddress) === key);
}
