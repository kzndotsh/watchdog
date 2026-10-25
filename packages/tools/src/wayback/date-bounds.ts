/**
 * Date bounds for a Wayback CDX query. A person writes `2019`, `2019-06` or `2019-06-30`; CDX
 * wants `from` / `to` as timestamps, so each bound becomes a full 14-digit `YYYYMMDDhhmmss`.
 * `after` is inclusive from the start of its period and `before` is inclusive to its end, so
 * `before: 2019` keeps a capture made at 2019-12-31 23:59:59.
 */

export type WaybackBoundEdge = "after" | "before";

const BOUND_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const MIN_YEAR = 1996;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The CDX timestamp for a bound, or `null` when the text is not a real date at that precision. */
export function waybackBoundTimestamp(
  input: string,
  edge: WaybackBoundEdge
): string | null {
  const match = BOUND_PATTERN.exec(input.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  if (year < MIN_YEAR) return null;
  const monthText = match[2];
  const dayText = match[3];
  if (monthText === undefined) {
    return edge === "after" ? `${year}0101000000` : `${year}1231235959`;
  }
  const month = Number(monthText);
  if (month < 1 || month > 12) return null;
  if (dayText === undefined) {
    return edge === "after"
      ? `${year}${pad(month)}01000000`
      : `${year}${pad(month)}${pad(daysInMonth(year, month))}235959`;
  }
  const day = Number(dayText);
  if (day < 1 || day > daysInMonth(year, month)) return null;
  const date = `${year}${pad(month)}${pad(day)}`;
  return edge === "after" ? `${date}000000` : `${date}235959`;
}

/** True when `after` and `before` (either may be absent) parse and `after` is not later. */
export function waybackBoundsOrdered(
  after: string | undefined,
  before: string | undefined
): boolean {
  if (after === undefined || before === undefined) return true;
  const from = waybackBoundTimestamp(after, "after");
  const to = waybackBoundTimestamp(before, "before");
  if (from === null || to === null) return true;
  return from <= to;
}
