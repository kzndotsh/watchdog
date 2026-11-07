import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { useReloadIntoOrganization } from "@/domains/organization/hooks/use-reload-into-organization";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

export type AcceptUserInvitationVariables = {
  id: string;
  organizationId: string;
};

/**
 * Accept an invitation addressed to the signed-in user, make the joined organization the
 * active one, then hard-navigate into it.
 */
export function useAcceptUserInvitation() {
  const reloadIntoOrganization = useReloadIntoOrganization();
  return useMutation({
    mutationFn: async (invitation: AcceptUserInvitationVariables) => {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId: invitation.id,
      });
      if (error) {
        throw new Error(
          messageOr(error.message, couldnt("accept", "invitation"))
        );
      }
      const active = await authClient.organization.setActive({
        organizationId: invitation.organizationId,
      });
      if (active.error) {
        throw new Error(
          messageOr(active.error.message, couldnt("switch", "organization"))
        );
      }
    },
    onSuccess: reloadIntoOrganization,
    onError: (error) => {
      toast.error(errMessage(error, couldnt("accept", "the invitation")));
    },
  });
}
