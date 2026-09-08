function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function whoisStatusList(status: unknown): string[] {
  if (Array.isArray(status)) return status.map(String);
  return typeof status === "string" ? [status] : [];
}

export function extractVcard(
  vcard: unknown[] | null,
  field: "fn" | "org"
): string | null {
  if (!vcard || vcard.length < 2) return null;
  const props = vcard[1];
  if (!Array.isArray(props)) return null;
  for (const row of props) {
    if (Array.isArray(row) && row[0] === field && typeof row[3] === "string") {
      return row[3];
    }
  }
  return null;
}

export function readRdapLdhName(ns: unknown): string | null {
  if (isRecord(ns) && typeof ns.ldhName === "string") return ns.ldhName;
  return null;
}

export function parseWhoisDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** RDAP `events` → registration / expiration timestamps. */
export function readRdapDates(raw: Record<string, unknown>): {
  registeredAt: string | null;
  expiresAt: string | null;
} {
  const events = Array.isArray(raw.events) ? raw.events : [];
  let registeredAt: string | null = null;
  let expiresAt: string | null = null;
  for (const event of events) {
    if (!isRecord(event)) continue;
    const action =
      typeof event.eventAction === "string"
        ? event.eventAction.toLowerCase()
        : "";
    const date = parseWhoisDate(event.eventDate);
    if (date === null) continue;
    if (
      (action === "registration" || action === "registered") &&
      (registeredAt === null || date < registeredAt)
    ) {
      registeredAt = date;
    }
    if (
      (action === "expiration" || action === "expired") &&
      (expiresAt === null || date > expiresAt)
    ) {
      expiresAt = date;
    }
  }
  return { registeredAt, expiresAt };
}
