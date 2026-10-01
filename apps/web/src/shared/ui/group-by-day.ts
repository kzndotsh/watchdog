/** Day-bucket helpers for Queue lists — presentational, no I/O. */

export interface DayBucket<T> {
  key: string;
  label: string;
  items: T[];
}

function formatDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Group items by local calendar day of `getIso(item)` (newest-day keys as Map insert order). */
export function groupItemsByDay<T>(
  items: T[],
  getIso: (item: T) => string
): DayBucket<T>[] {
  const groups = new Map<string, T[]>();
  const now = new Date();
  const todayKey = formatDayKey(now);
  const yesterdayKey = formatDayKey(new Date(now.getTime() - 86_400_000));

  for (const item of items) {
    const key = formatDayKey(new Date(getIso(item)));
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, dayItems]) => ({
    key,
    label: dayLabel(key, todayKey, yesterdayKey),
    items: dayItems,
  }));
}
