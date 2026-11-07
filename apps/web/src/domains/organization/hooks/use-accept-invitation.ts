import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";
import { couldnt, messageOr } from "@/lib/utils";

/**
 * Accept the invitation with the signed-in account (variable: the invitation id). On success
 * the hook hard-navigates into the joined organization; the caller shows the error from the
 * returned mutation.
 */
export function useAcceptInvitation() {
  const reloadIntoOrganization = useReloadIntoOrganization();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (error)
        throw new Error(
          messageOr(error.message, couldnt("accept", "invitation"))
        );
    },
    onSuccess: reloadIntoOrganization,
  });
}
