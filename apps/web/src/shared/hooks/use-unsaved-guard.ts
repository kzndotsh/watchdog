import { useBlocker } from "@tanstack/react-router";

/** What `UnsavedChangesDialog` needs: whether a navigation is waiting, and its two answers. */
export type UnsavedGuard = {
  isBlocked: boolean;
  /** Cancel the navigation and keep the draft. */
  stay: () => void;
  /** Drop the draft and continue to the page the user asked for. */
  discard: () => void;
};

function blockEveryNavigation() {
  return true;
}

/**
 * Guards a form or editor that holds unsaved input. While `isDirty` is true a router
 * navigation waits for the user's answer (render `UnsavedChangesDialog` with the result)
 * and closing the tab triggers the browser's own warning (the router's `beforeunload`
 * handler). When `isDirty` turns false, after a save or a discard, the guard is gone.
 *
 * Pass what the user would lose, not "was ever edited": a form that was typed in and
 * put back to its defaults is clean, and a save in flight is not dirty (the write is
 * already on its way).
 */
export function useUnsavedGuard(isDirty: boolean): UnsavedGuard {
  const resolver = useBlocker({
    shouldBlockFn: blockEveryNavigation,
    disabled: !isDirty,
    withResolver: true,
  });
  return {
    isBlocked: resolver.status === "blocked",
    stay: () => resolver.reset?.(),
    discard: () => resolver.proceed?.(),
  };
}
