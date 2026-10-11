import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { couldnt } from "@/lib/utils";

/**
 * Leave an organization (variable: its id). No cache settling: the caller reloads into
 * another organization on success, which drops every cache.
 */
export function useLeaveOrganization() {
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- the caller hard-reloads into another organization, which discards every cache; there is no mounted screen left to go stale
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.leave({ organizationId });
      if (error)
        throw new Error(error.message ?? couldnt("leave", "organization"));
    },
  });
}
