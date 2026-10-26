import type { ReactNode } from "react";

import { EmptyState } from "@/shared/ui/empty-state";

type ListEmptyProps = {
  /** From `list.status`, never chosen by the screen. */
  readonly status: "blank" | "no-match";
  readonly noun: { readonly one: string; readonly many: string };
  /** blank: the screen's add action ("Add identifier"). */
  readonly action?: ReactNode;
  /** no-match: Clear filters (`list.controls.reset`; fixed filters stay). */
  readonly onClearFilters: () => void;
  /** `sm` inside a table body or a Dossier tab. */
  readonly size?: "default" | "sm";
};

/** "Nothing matches these filters", in the house Title Case. */
const NO_MATCH_TITLE = "Nothing Matches These Filters";

/**
 * A list's empty state, with fixed copy: `blank` is "No <noun> yet" with the screen's add action;
 * `no-match` is "Nothing matches these filters" with Clear filters. The status comes from
 * `useList`, which never reports `blank` while a filter or search is applied.
 */
export function ListEmpty({
  status,
  noun,
  action,
  onClearFilters,
  size = "default",
}: ListEmptyProps) {
  if (status === "blank") {
    return (
      <EmptyState
        intent="blank-slate"
        items={noun.many}
        description=""
        action={action}
        size={size}
      />
    );
  }
  return (
    <EmptyState
      intent="no-results"
      items={noun.many}
      title={NO_MATCH_TITLE}
      description="Change the search or the filters, or clear them."
      onClearFilters={onClearFilters}
      size={size}
    />
  );
}
