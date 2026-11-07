import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";
import { couldnt } from "@/lib/utils";

/**
 * Leave an organization (variable: its id). On success the hook hard-navigates into another
 * organization, which drops every cache.
 */
export function useLeaveOrganization() {
  const reloadIntoOrganization = useReloadIntoOrganization();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.leave({ organizationId });
      if (error)
        throw new Error(error.message ?? couldnt("leave", "organization"));
    },
    onSuccess: reloadIntoOrganization,
  });
}
