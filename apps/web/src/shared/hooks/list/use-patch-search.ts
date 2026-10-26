import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

/** A list's URL patch: `def.toSearch(query)` (`undefined` removes a param). */
type SearchPatch = Readonly<Record<string, unknown>>;

/**
 * The route side of a list (the Library model, shared): merge a patch into the current route's
 * search and REPLACE the history entry, so typing and filtering never fill Back with one entry
 * per change. `undefined` removes a param, so `def.toSearch(query)` keeps the URL to the params
 * that differ from the defaults. The route's `validateSearch` (`def.searchWith`) types what
 * comes back; `useList` types what goes in.
 *
 *   const onSearchChange = usePatchSearch();
 *   const list = useList(view, { scope, search: routeApi.useSearch(), onSearchChange });
 */
export function usePatchSearch(): (patch: SearchPatch) => void {
  const navigate = useNavigate();
  return useCallback(
    (patch: SearchPatch) => {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
}
