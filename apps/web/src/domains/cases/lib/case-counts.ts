import type { ListTotal } from "@watchdog/schemas/shared";

/** The start of the browser's calendar day, as the ISO instant the counts' "overdue" is measured from. */
export function localDayStartIso(now: Date = new Date()): string {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();
}

/** A tile's value for a count: the number, or "1000+" once the server stopped counting at its cap. */
export function tileCount(total: ListTotal): number | string {
  return total.isCapped ? `${String(total.count)}+` : total.count;
}
