import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

export type AcceptUserInvitationVariables = {
  id: string;
  organizationId: string;
};

/**
 * Accept an invitation addressed to the signed-in user. `onAccepted` receives the joined
 * organization id (the caller makes it the active one).
 */
export function useAcceptUserInvitation({
  onAccepted,
}: { onAccepted?: (organizationId: string) => void } = {}) {
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- the caller makes the joined org active and hard-reloads, which discards every cache; there is no mounted screen left to go stale
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
      return invitation.organizationId;
    },
    onSuccess: (organizationId) => {
      onAccepted?.(organizationId);
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("accept", "the invitation")));
    },
  });
}
