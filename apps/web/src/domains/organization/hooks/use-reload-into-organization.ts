import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { reloadIntoOrganization } from "@/domains/organization/lib/switch-organization";
import { invalidateAfterOrganizationChange } from "@/shared/lib/query-invalidation";

/**
 * What every flow that changes the signed-in user's organization (create, switch, accept an
 * invitation, leave, delete) calls on success: mark the cached organization state and
 * session stale, then hard-navigate to `/`. The reload drops the whole cache anyway; the
 * invalidation keeps the guard honest if a flow ever stops reloading.
 */
export function useReloadIntoOrganization(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void invalidateAfterOrganizationChange(queryClient);
    reloadIntoOrganization();
  }, [queryClient]);
}
