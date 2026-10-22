import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { Library } from "@/domains/library/components/library";
import { warmLibraryQueries } from "@/domains/library/lib/prefetch-library";
import { RouteError } from "@/shared/layout/route-error";
import { trimmedOrUndefined } from "@watchdog/schemas/shared";

const routeApi = getRouteApi("/_protected/library");

/** A short URL token (entry key or input kind): trimmed, blank is absent, junk is dropped. A missing key is absent too. */
const searchToken = z
  .unknown()
  .transform((value) =>
    typeof value === "string"
      ? trimmedOrUndefined(value)?.slice(0, 128)
      : undefined
  )
  .optional();

function LibraryPage() {
  const { id, kind } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const handleIdChange = useCallback(
    (next: string | null) => {
      void navigate({
        search: (prev) => ({ ...prev, id: next ?? undefined }),
        replace: true,
      });
    },
    [navigate]
  );
  const handleKindChange = useCallback(
    (next: string | null) => {
      void navigate({
        search: (prev) => ({ ...prev, kind: next ?? undefined }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <Library
      selectedKey={id}
      inputKind={kind}
      onSelectedKeyChange={handleIdChange}
      onInputKindChange={handleKindChange}
    />
  );
}

/** The Library: every Cap and Playbook for the organization. Not Case-scoped. */
export const Route = createFileRoute("/_protected/library")({
  validateSearch: z.object({ id: searchToken, kind: searchToken }),
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient } }) => {
    warmLibraryQueries(queryClient);
  },
  errorComponent: RouteError,
  component: LibraryPage,
});
