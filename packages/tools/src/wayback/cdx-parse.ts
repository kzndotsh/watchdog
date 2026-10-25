import type { WaybackCdxRow } from "./schema";

/** `Array.isArray` narrows to `any[]` in lib.es5.d.ts; this narrows to `unknown[]` instead. */
export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Stringify a CDX cell only if it's already string/number/boolean — avoids `[object Object]`. */
function cdxField(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

const CDX_OPTIONAL_FIELDS = [
  [2, "statuscode"],
  [3, "mimetype"],
  [4, "digest"],
] as const;

const CDX_LENGTH_INDEX = 5;

function cdxRowFromArray(row: unknown, url: string): WaybackCdxRow | null {
  if (!isUnknownArray(row) || !row[0]) return null;
  const parsed: WaybackCdxRow = {
    timestamp: cdxField(row[0]) ?? "",
    original: cdxField(row[1]) ?? url,
  };
  for (const [index, key] of CDX_OPTIONAL_FIELDS) {
    if (row[index] === undefined) continue;
    parsed[key] = cdxField(row[index]) ?? "";
  }
  const lengthText = cdxField(row[CDX_LENGTH_INDEX]);
  if (lengthText !== undefined && lengthText !== "") {
    const length = Number(lengthText);
    if (Number.isFinite(length)) parsed.length = length;
  }
  return parsed;
}

export type ParsedCdx = {
  rows: WaybackCdxRow[];
  /** Present when the page was cut by `limit` and more rows follow. */
  resumeKey: string | null;
};

/**
 * Rows of a CDX `output=json` payload. With `showResumeKey` the data is followed by an empty
 * array and then a one-cell array holding the key; that tail is never a capture.
 */
export function parseCdxPayload(payload: unknown[], url: string): ParsedCdx {
  const hasHeader =
    isUnknownArray(payload[0]) && String(payload[0][0]) === "timestamp";
  const body = hasHeader ? payload.slice(1) : payload;
  const separator = body.findIndex(
    (row) => isUnknownArray(row) && row.length === 0
  );
  const dataRows = separator === -1 ? body : body.slice(0, separator);
  let resumeKey: string | null = null;
  if (separator !== -1) {
    const tail = body[separator + 1];
    const key = isUnknownArray(tail) ? cdxField(tail[0]) : undefined;
    if (key !== undefined && key !== "") resumeKey = key;
  }
  const rows: WaybackCdxRow[] = [];
  for (const row of dataRows) {
    const parsed = cdxRowFromArray(row, url);
    if (parsed) rows.push(parsed);
  }
  return { rows, resumeKey };
}
