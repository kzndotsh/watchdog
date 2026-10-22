import type { QueryClient } from "@tanstack/react-query";

import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { credentialsListQuery } from "@/domains/settings/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";

/** The route loader's warm: the catalog and the vault slots readiness reads. Does not block paint. */
export function warmLibraryQueries(queryClient: QueryClient): void {
  warmEnsureQueryData(queryClient, {
    ...capabilitiesListQuery(),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...playbooksListQuery(),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...credentialsListQuery(),
    shouldRevalidateIfStale: true,
  });
}
