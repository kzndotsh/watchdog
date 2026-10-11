/**
 * Typing delays, in one place. Every debounce in the web app takes its wait from here and
 * goes through `useDebouncedValue` (`@/shared/hooks/use-debounced-value`).
 */

/** Command palette search: wait this long after the last keystroke before querying. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Organization slug availability check: wait this long after the last edit. */
export const SLUG_CHECK_DEBOUNCE_MS = 400;
