import { useId, useMemo, useState } from "react";

import {
  matchPlaybooks,
  PLAYBOOK_EGRESS_FILTERS,
  playbookEgressFilterLabel,
  playbookSeedFilterLabel,
  playbookSeedFilterOptions,
} from "@/domains/jobs/lib/playbook-match";
import type { PlaybookListItem } from "@/domains/jobs/types";
import type { PageFilterChip } from "@/shared/layout/page-filter-menu";

export function usePlaybookRunFilters(playbooks: PlaybookListItem[]) {
  const needsKeyOnlyId = useId();
  const urlDumpOnlyId = useId();
  const [seedFilter, setSeedFilter] = useState("");
  const [egressFilter, setEgressFilter] = useState("");
  const [needsKeyOnly, setNeedsKeyOnly] = useState(false);
  const [urlDumpOnly, setUrlDumpOnly] = useState(false);

  const seedOptions = useMemo(
    () => playbookSeedFilterOptions(playbooks),
    [playbooks]
  );
  const visiblePlaybooks = useMemo(
    () =>
      matchPlaybooks(playbooks, {
        seedFilter,
        egressFilter,
        needsKeyOnly,
        urlDumpOnly,
      }),
    [playbooks, seedFilter, egressFilter, needsKeyOnly, urlDumpOnly]
  );
  const filterChips: PageFilterChip[] = useMemo(() => {
    const chips: PageFilterChip[] = [];
    if (seedFilter) {
      chips.push({
        id: "seed",
        label: playbookSeedFilterLabel(seedFilter),
        onClear: () => {
          setSeedFilter("");
        },
      });
    }
    if (egressFilter) {
      chips.push({
        id: "egress",
        label: playbookEgressFilterLabel(egressFilter),
        onClear: () => {
          setEgressFilter("");
        },
      });
    }
    if (needsKeyOnly) {
      chips.push({
        id: "needsKey",
        label: "Needs key",
        onClear: () => {
          setNeedsKeyOnly(false);
        },
      });
    }
    if (urlDumpOnly) {
      chips.push({
        id: "urlDump",
        label: "URL dump",
        onClear: () => {
          setUrlDumpOnly(false);
        },
      });
    }
    return chips;
  }, [seedFilter, egressFilter, needsKeyOnly, urlDumpOnly]);

  function clearPlaybookFilters() {
    setSeedFilter("");
    setEgressFilter("");
    setNeedsKeyOnly(false);
    setUrlDumpOnly(false);
  }

  return {
    needsKeyOnlyId,
    urlDumpOnlyId,
    seedFilter,
    setSeedFilter,
    egressFilter,
    setEgressFilter,
    needsKeyOnly,
    setNeedsKeyOnly,
    urlDumpOnly,
    setUrlDumpOnly,
    seedOptions,
    visiblePlaybooks,
    filterChips,
    clearPlaybookFilters,
    egressFilterOptions: PLAYBOOK_EGRESS_FILTERS.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  };
}
