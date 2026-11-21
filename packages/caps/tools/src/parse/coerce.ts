/** Narrow unknown → plain object (not array / null). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Filter unknown[] → Record rows (drops primitives / null / arrays). */
export function recordRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => isRecord(row));
}

/** Coerce unknown → trimmed string or null. */
export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** Coerce unknown → trimmed string; non-strings become "". */
export function asStringEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "no" || v === "0") return false;
  }
  if (typeof value === "number") return value !== 0;
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
