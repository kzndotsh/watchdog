const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` → ISO at local noon (stable calendar day). */
export function dueDateToIso(dateOnly: string): string | null {
  const trimmed = dateOnly.trim();
  if (!trimmed) return null;
  const m = DATE_ONLY.exec(trimmed);
  if (m) {
    const localNoon = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      12,
      0,
      0,
      0
    );
    return localNoon.toISOString();
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** ISO → `YYYY-MM-DD` for `<input type="date">`. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function calendarDayMs(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function todayDayMs(): number {
  const today = new Date();
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
}

export function isTaskDueOverdue(
  dueDate: string | null | undefined,
  status: string
): boolean {
  if (!dueDate) return false;
  if (status === "done" || status === "dropped") return false;
  const dueDay = calendarDayMs(dueDate);
  if (dueDay === null) return false;
  return todayDayMs() > dueDay;
}
