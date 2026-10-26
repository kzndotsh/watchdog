import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { LIST_SEARCH_DEBOUNCE_MS } from "@/shared/lib/debounce";
import { LIST_SEARCH_MIN_LENGTH } from "@watchdog/schemas/shared";

/** The `q` a draft writes: null for empty, undefined while too short to send (nothing is written). */
export function committedSearch(text: string): string | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return trimmed.length >= LIST_SEARCH_MIN_LENGTH ? trimmed : undefined;
}

type DraftState = {
  readonly text: string;
  /** The URL `q` the text was last based on. */
  readonly base: string | null;
  readonly isFocused: boolean;
  /** The last `q` this box wrote: the URL echoing it back is not someone else's navigation. */
  readonly committed: string | null | undefined;
};

export type ListSearchDraft = {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly setFocused: (isFocused: boolean) => void;
  /** Escape: empty the box and drop `q` at once. */
  readonly clear: () => void;
  /** Empty the box without writing: the caller writes `q` with its own patch (Clear all). */
  readonly discard: () => void;
};

/**
 * The search box's text against the URL's `q`. While the box has focus the text is the source of
 * truth: the URL echoing this box's own write never replaces what is being typed. Any other URL
 * change (Back, a link) re-bases the text during render, focused or not, and drops the pending
 * write, so the navigation wins. Each settled text is written once, after
 * `LIST_SEARCH_DEBOUNCE_MS`, and only when empty or at least `LIST_SEARCH_MIN_LENGTH` characters;
 * blur and Escape write at once.
 */
export function useListSearchDraft(
  urlQ: string | null,
  onCommit: (q: string | null) => void
): ListSearchDraft {
  const [state, setState] = useState<DraftState>({
    text: urlQ ?? "",
    base: urlQ,
    isFocused: false,
    committed: undefined,
  });
  if (state.base !== urlQ) {
    const isOwnEcho = state.isFocused && urlQ === state.committed;
    setState(
      isOwnEcho
        ? { ...state, base: urlQ }
        : { ...state, text: urlQ ?? "", base: urlQ }
    );
  }

  const debounced = useDebouncedValue(
    state.text,
    LIST_SEARCH_DEBOUNCE_MS,
    state.text
  );
  /** The last text written (or found in the URL): each text is written once, not on every URL change. */
  const sentRef = useRef(state.text);
  const write = (text: string) => {
    sentRef.current = text;
    const q = committedSearch(text);
    if (q === undefined || q === urlQ) return;
    setState((prev) => ({ ...prev, committed: q }));
    onCommit(q);
  };
  const writeSettled = useEffectEvent((text: string) => {
    if (text !== sentRef.current) write(text);
  });

  const settled = debounced.isSettled ? debounced.value : null;
  // The settled text goes to the router, an external system.
  useEffect(() => {
    if (settled !== null) writeSettled(settled);
  }, [settled]);

  return {
    text: state.text,
    setText: (text) => {
      setState((prev) => ({ ...prev, text }));
    },
    setFocused: (isFocused) => {
      setState((prev) => ({ ...prev, isFocused }));
      // Unsent typing goes out on blur (after a navigation the text is already re-based).
      if (!isFocused && state.text !== sentRef.current) write(state.text);
    },
    clear: () => {
      setState((prev) => ({ ...prev, text: "" }));
      write("");
    },
    discard: () => {
      sentRef.current = "";
      setState((prev) => ({ ...prev, text: "" }));
    },
  };
}
