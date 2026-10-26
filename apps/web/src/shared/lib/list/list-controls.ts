import {
  emptyFilterValue,
  opsOf,
  type AnyListDef,
  type FilterKey,
  type FixedFilters,
  type ListQuery,
} from "@watchdog/schemas/shared";

import { isQueryValue } from "./list-guards";
import type { ListControls } from "./list-types";

/** The search box's draft, as `useListSearchDraft` keeps it. */
export type ListDraft = {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly setFocused: (isFocused: boolean) => void;
  readonly clear: () => void;
  readonly discard: () => void;
};

/**
 * A view's controls: every change goes through the declaration's canonical functions
 * (`withFilter`, `cleared`) and is written as one URL patch by `write`.
 */
export function listControlsOf<D extends AnyListDef, K extends FilterKey<D>>(
  def: D,
  query: ListQuery<D>,
  fixed: Pick<FixedFilters<D>, K> | undefined,
  draft: ListDraft,
  write: (next: ListQuery<D>) => void
): ListControls<D> {
  const ops = opsOf(def);
  return {
    draftQ: draft.text,
    setDraftQ: draft.setText,
    setSearchFocused: draft.setFocused,
    clearSearch: draft.clear,
    availableFilters: ops.availableFilters(fixed),
    setFilter: (key, value) => {
      write(ops.withFilter(query, key, value, fixed));
    },
    removeFilter: (key) => {
      const empty = emptyFilterValue(def.filters[key]);
      if (isQueryValue(def, key, empty)) {
        write(ops.withFilter(query, key, empty, fixed));
      }
    },
    setSort: (sort) => {
      write({ ...query, sort });
    },
    reset: () => {
      draft.discard();
      write(ops.cleared(query, fixed));
    },
  };
}
