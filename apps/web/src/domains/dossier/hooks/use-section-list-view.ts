import { useState } from "react";

/** A Dossier list section's view: the route's (a tab) or its own (the Overview's nest). */
export type SectionListView<Search, Patch> = {
  readonly search: Search;
  readonly onSearchChange: (patch: Patch) => void;
};

/**
 * The view a list section shows: the tab's URL view when the route passes one, else a view held
 * in component state (the Overview's nest, which has no toolbar and never writes the URL).
 */
export function useSectionListView<
  Search extends object,
  Patch extends Partial<Search>,
>(
  routed: SectionListView<Search, Patch> | undefined,
  initial: Search
): SectionListView<Search, Patch> {
  const [search, setSearch] = useState<Search>(initial);
  if (routed !== undefined) return routed;
  return {
    search,
    onSearchChange: (patch) => {
      setSearch((prev) => ({ ...prev, ...patch }));
    },
  };
}
