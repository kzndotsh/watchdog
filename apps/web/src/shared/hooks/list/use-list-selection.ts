import { useState } from "react";

import type { ListSelectionState } from "@/shared/lib/list/list-types";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Row selection keyed by the view: the state remembers which view it was made in, and reads as
 * empty in any other, so a new filter, search or sort clears it with no effect and no remount.
 * Going back to a view does not restore it (the next write replaces the stored view).
 */
export function useListSelection(viewKey: string): ListSelectionState {
  const [state, setState] = useState<{
    readonly viewKey: string;
    readonly ids: ReadonlySet<string>;
  }>({ viewKey, ids: EMPTY });
  const ids = state.viewKey === viewKey ? state.ids : EMPTY;

  const setIds = (next: ReadonlySet<string>) => {
    setState({ viewKey, ids: next });
  };

  return {
    ids,
    toggle: (id) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setIds(next);
    },
    setIds,
    clear: () => {
      setIds(EMPTY);
    },
  };
}
