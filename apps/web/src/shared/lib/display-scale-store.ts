import {
  applyDisplayScale,
  DEFAULT_DISPLAY_SCALE,
  DISPLAY_SCALE_STORAGE_KEY,
  normalizeDisplayScale,
  type DisplayScale,
} from "@/shared/lib/display-scale";

/**
 * Framework-free store for the persisted display scale (localStorage is the
 * source of truth). Shaped for `useSyncExternalStore`; the listener set stays
 * private to this module.
 */

const listeners = new Set<() => void>();

/** Current stored scale. A primitive, so the snapshot is stable between changes. */
export function getDisplayScale(): DisplayScale {
  return normalizeDisplayScale(
    window.localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY)
  );
}

/** Scale for server renders (no storage available). */
export function getServerDisplayScale(): DisplayScale {
  return DEFAULT_DISPLAY_SCALE;
}

/** Notifies on this tab's changes and on other tabs' `storage` events. */
// oxlint-disable-next-line promise/prefer-await-to-callbacks -- useSyncExternalStore subscribe contract requires a sync callback
export function subscribeToDisplayScale(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  listeners.add(callback);
  return () => {
    window.removeEventListener("storage", callback);
    listeners.delete(callback);
  };
}

/** Persist, apply to the document, and notify subscribers. */
export function persistDisplayScale(scale: DisplayScale): void {
  window.localStorage.setItem(DISPLAY_SCALE_STORAGE_KEY, String(scale));
  applyDisplayScale(scale);
  for (const listener of listeners) listener();
}
