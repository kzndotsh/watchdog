import { useMemo, useRef } from "react";

import { matchPlaybooks } from "@/domains/jobs/lib/playbook-match";
import { playbookPickList } from "@/domains/jobs/lib/playbook-pick-list";
import type { PlaybookListItem } from "@/domains/jobs/types";
import {
  useBoundedList,
  useLocalListSearch,
} from "@/shared/hooks/list/use-bounded-list";
import { opsOf } from "@watchdog/schemas/shared";

/**
 * The Playbook run form's filters: the picker's bounded list (`playbookPickList`), held in the
 * form's state, over the registry the form already has. `visiblePlaybooks` is what the form's
 * Playbook select shows.
 */
export function usePlaybookRunFilters(playbooks: readonly PlaybookListItem[]) {
  const [search, onSearchChange] = useLocalListSearch<typeof playbookPickList>(
    {}
  );
  const query = useMemo(
    () => opsOf(playbookPickList).queryOf(search),
    [search]
  );
  const visiblePlaybooks = useMemo(
    () =>
      matchPlaybooks(playbooks, {
        seeds: query.filters.seed,
        egress: query.filters.egress,
        isKeyOnlyNeeded: query.filters.needsKey,
        isUrlDumpOnly: query.filters.urlDump,
      }),
    [playbooks, query]
  );
  const list = useBoundedList(playbookPickList, {
    rows: visiblePlaybooks,
    getId: (playbook) => playbook.id,
    totalRows: playbooks.length,
    search,
    onSearchChange,
  });
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  return { list, filtersButtonRef, visiblePlaybooks };
}
