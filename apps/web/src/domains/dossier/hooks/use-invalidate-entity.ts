import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { entityChangedOpts } from "@/domains/entities/lib/entity-invalidation-opts";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";

/**
 * Invalidate entity-scoped Query caches for a dossier write that is not a
 * mutation of its own. The scope is passed per call, not captured from props;
 * a missing slug is resolved from the cached Entity list.
 */
export function useInvalidateEntity() {
  const queryClient = useQueryClient();
  return useCallback(
    async ({
      caseId,
      entityId,
      entitySlug,
    }: Omit<DossierEntityScope, "entitySlug"> & { entitySlug?: string }) =>
      invalidateAfterEntityChanged(
        queryClient,
        caseId,
        entityChangedOpts(queryClient, caseId, entityId, entitySlug)
      ),
    [queryClient]
  );
}
