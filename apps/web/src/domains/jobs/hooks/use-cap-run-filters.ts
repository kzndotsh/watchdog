import { useMemo, useRef } from "react";

import {
  categoryFilterOptions,
  matchCaps,
  type PasteDetectResult,
} from "@/domains/jobs/lib/cap-match";
import { capPickList } from "@/domains/jobs/lib/cap-pick-list";
import type { CapListItem } from "@/domains/jobs/types";
import {
  useBoundedList,
  useLocalListSearch,
} from "@/shared/hooks/list/use-bounded-list";
import { opsOf } from "@watchdog/schemas/shared";

/**
 * The Cap run form's filters: the picker's bounded list (`capPickList`), held in the form's
 * state, over the catalog the form already has. `visibleCaps` is what the form's Cap select
 * shows: the Caps that pass the filters and take the pasted input, plus the Cap of a re-run
 * (`prefillCapId`), which stays selectable even when its input reads as another kind.
 */
export function useCapRunFilters(
  caps: readonly CapListItem[],
  {
    paste,
    prefillCapId,
  }: {
    paste: PasteDetectResult | null;
    prefillCapId: string | undefined;
  }
) {
  const [search, onSearchChange] = useLocalListSearch<typeof capPickList>({});
  const query = useMemo(() => opsOf(capPickList).queryOf(search), [search]);
  const categoryOptions = useMemo(() => categoryFilterOptions(caps), [caps]);
  const visibleCaps = useMemo(() => {
    const matched = matchCaps(caps, {
      kinds: query.filters.kind,
      categories: query.filters.category,
      intents: query.filters.intent,
      isKeyOnlyNeeded: query.filters.needsKey,
      paste,
    });
    if (
      prefillCapId === undefined ||
      matched.some((cap) => cap.id === prefillCapId)
    ) {
      return matched;
    }
    const pinned = caps.find((cap) => cap.id === prefillCapId);
    return pinned === undefined ? matched : [pinned, ...matched];
  }, [caps, query, paste, prefillCapId]);

  const list = useBoundedList(capPickList, {
    rows: visibleCaps,
    getId: (cap) => cap.id,
    totalRows: caps.length,
    search,
    onSearchChange,
  });
  const sources = useMemo(
    () => ({
      category: { kind: "tags" as const, options: categoryOptions },
    }),
    [categoryOptions]
  );
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  return { list, sources, filtersButtonRef, visibleCaps };
}
