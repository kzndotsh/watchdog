import { z } from "zod";

/**
 * Per-viewer presentation state of one list (column visibility, view toggles, density), kept in
 * `localStorage` under `wd.list.<key>`. A per-viewer convenience: every read and write is in a
 * try/catch, and a missing, blocked or malformed entry reads as the defaults.
 */

export type ListDensity = "comfortable" | "compact";

export type StoredListDisplay = {
  readonly hiddenColumns: readonly string[];
  readonly toggles: Readonly<Record<string, boolean>>;
  readonly density: ListDensity;
};

export const DEFAULT_LIST_DISPLAY: StoredListDisplay = {
  hiddenColumns: [],
  toggles: {},
  density: "comfortable",
};

/** A malformed entry (another version, a hand edit) reads as the defaults, whole. */
const storedSchema = z.object({
  hiddenColumns: z.array(z.string().max(64)).max(64),
  toggles: z.record(z.string().max(64), z.boolean()),
  density: z.enum(["comfortable", "compact"]),
});

export function listDisplayStorageKey(key: string): string {
  return `wd.list.${key}`;
}

/** The last raw entry read per key and its parsed value: a stable snapshot for `useSyncExternalStore`. */
const snapshots = new Map<
  string,
  { readonly raw: string | null; readonly value: StoredListDisplay }
>();
const listeners = new Map<string, Set<() => void>>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(listDisplayStorageKey(key));
  } catch {
    return null;
  }
}

function parse(raw: string | null): StoredListDisplay {
  if (raw === null) return DEFAULT_LIST_DISPLAY;
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_LIST_DISPLAY;
  } catch {
    return DEFAULT_LIST_DISPLAY;
  }
}

/** The stored display of `key`; the same object until the entry changes. */
export function readListDisplay(key: string): StoredListDisplay {
  const raw = readRaw(key);
  const cached = snapshots.get(key);
  if (cached !== undefined && cached.raw === raw) return cached.value;
  const value = parse(raw);
  snapshots.set(key, { raw, value });
  return value;
}

/** Calls `onChange` when `key` is written here or in another tab. */
export function subscribeListDisplay(
  key: string,
  onChange: () => void
): () => void {
  let set = listeners.get(key);
  if (set === undefined) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === listDisplayStorageKey(key)) onChange();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    set.delete(onChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function writeListDisplay(key: string, value: StoredListDisplay): void {
  const raw = JSON.stringify(value);
  try {
    window.localStorage.setItem(listDisplayStorageKey(key), raw);
  } catch {
    // Storage blocked or full: keep the choice in memory for this page.
  }
  // A blocked write reads back as null, which then matches every later read: the choice stays.
  snapshots.set(key, { raw: readRaw(key), value });
  for (const listener of listeners.get(key) ?? []) listener();
}
