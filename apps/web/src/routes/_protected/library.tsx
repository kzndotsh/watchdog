import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";

import { Library } from "@/domains/library/components/library";
import {
  librarySearchSchema,
  type LibrarySearchPatch,
} from "@/domains/library/lib/library-search";
import { warmLibraryQueries } from "@/domains/library/lib/prefetch-library";
import { RouteError } from "@/shared/layout/route-error";

const routeApi = getRouteApi("/_protected/library");

function LibraryPage() {
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const handleSearchChange = useCallback(
    (patch: LibrarySearchPatch) => {
      void navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return <Library search={search} onSearchChange={handleSearchChange} />;
}

/** The Library: every Cap and Playbook for the organization. Not Case-scoped. */
export const Route = createFileRoute("/_protected/library")({
  validateSearch: librarySearchSchema,
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient } }) => {
    warmLibraryQueries(queryClient);
  },
  errorComponent: RouteError,
  component: LibraryPage,
});
