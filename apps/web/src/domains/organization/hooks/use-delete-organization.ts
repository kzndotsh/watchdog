import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";
import { couldnt } from "@/lib/utils";

/**
 * Delete an organization (variable: its id). On success the hook hard-navigates into another
 * organization, which drops every cache.
 */
export function useDeleteOrganization() {
  const reloadIntoOrganization = useReloadIntoOrganization();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await authClient.organization.delete({
        organizationId,
      });
      if (error)
        throw new Error(error.message ?? couldnt("delete", "organization"));
    },
    onSuccess: reloadIntoOrganization,
  });
}
