import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";

/**
 * Leave an organization (variable: its id). No cache settling: the caller reloads into
 * another organization on success, which drops every cache.
 */
export function useLeaveOrganization() {
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.leave({ organizationId });
      if (error) throw new Error(error.message ?? "Couldn't leave");
    },
  });
}
