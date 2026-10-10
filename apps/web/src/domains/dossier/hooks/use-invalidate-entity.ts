import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { DossierEntityScope } from "@/domains/dossier/types";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";

/**
 * Invalidate entity-scoped Query caches for a dossier write that is not a
 * mutation of its own. The scope is passed per call, not captured from props.
 */
export function useInvalidateEntity() {
  const queryClient = useQueryClient();
  return useCallback(
    async ({ caseId, entityId, entitySlug }: DossierEntityScope) =>
      invalidateAfterEntityChanged(queryClient, caseId, {
        entityId,
        slug: entitySlug,
      }),
    [queryClient]
  );
}
