import { useState } from "react";

import type { ListSelectionState } from "@/shared/lib/list/list-types";

const EMPTY: ReadonlySet<string> = new Set();

type SelectionState = {
  readonly viewKey: string;
  readonly ids: ReadonlySet<string>;
};

/**
 * Row selection that belongs to one view: when the view changes (a filter, the search or the
 * sort), the selection is dropped during render, so going back to an earlier view never brings
 * its old selection back.
 */
export function useListSelection(viewKey: string): ListSelectionState {
  const [state, setState] = useState<SelectionState>({ viewKey, ids: EMPTY });
  if (state.viewKey !== viewKey) {
    setState({ viewKey, ids: EMPTY });
  }
  const ids = state.viewKey === viewKey ? state.ids : EMPTY;

  const update = (
    next: (current: ReadonlySet<string>) => ReadonlySet<string>
  ) => {
    setState((prev) => ({
      viewKey,
      ids: next(prev.viewKey === viewKey ? prev.ids : EMPTY),
    }));
  };

  return {
    ids,
    toggle: (id) => {
      update((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    setIds: (next) => {
      update(() => next);
    },
    clear: () => {
      update(() => EMPTY);
    },
  };
}
