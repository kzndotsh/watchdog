/**
 * Typing delays, in one place. Every debounce in the web app takes its wait from here and
 * goes through `useDebouncedValue` (`@/shared/hooks/use-debounced-value`).
 */

/** Command palette search: wait this long after the last keystroke before querying. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Organization slug availability check: wait this long after the last edit. */
export const SLUG_CHECK_DEBOUNCE_MS = 400;

/** List search box: wait this long after the last keystroke before writing `q` to the URL. */
export const LIST_SEARCH_DEBOUNCE_MS = 300;

/** A server-searched picker (Evidence, Entities): wait this long after the last keystroke before asking. */
export const PICKER_SEARCH_DEBOUNCE_MS = 250;
