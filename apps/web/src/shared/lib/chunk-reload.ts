/**
 * Stale-chunk recovery. After a deploy, an open tab still references code chunks the new build no
 * longer serves, so a dynamic import fails. One reload fetches the new build. The reload is
 * guarded by a session flag (a timestamp) so a chunk that is still missing after the reload shows
 * the error screen instead of looping, and an unreadable `sessionStorage` means no reload at all.
 */

export const CHUNK_RELOAD_KEY = "wd-chunk-reload";

/** A second chunk failure inside this window is not a stale deploy: no second reload. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

const CHUNK_MESSAGES: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Loading (?:CSS )?chunk [\w-]+ failed/i,
  /ChunkLoadError/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const name: unknown = Reflect.get(error, "name");
  const message: unknown = Reflect.get(error, "message");
  const text = `${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`;
  return CHUNK_MESSAGES.some((pattern) => pattern.test(text));
}

export type ChunkReloadDeps = {
  /** `null` stands for storage that is unavailable. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  reload?: () => void;
  now?: () => number;
};

function sessionStorageOrNull(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reload the page once for a chunk-load failure. True when it reloaded; false for any other error,
 * for a failure right after a reload, and when the guard cannot be stored.
 */
export function reloadOnceForStaleChunk(
  error: unknown,
  deps: ChunkReloadDeps = {}
): boolean {
  if (!isChunkLoadError(error)) return false;
  const storage =
    deps.storage === undefined ? sessionStorageOrNull() : deps.storage;
  if (storage === null) return false;
  const now = (deps.now ?? Date.now)();
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
    if (
      Number.isFinite(last) &&
      last > 0 &&
      now - last < CHUNK_RELOAD_WINDOW_MS
    ) {
      return false;
    }
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  (
    deps.reload ??
    (() => {
      globalThis.location.reload();
    })
  )();
  return true;
}
