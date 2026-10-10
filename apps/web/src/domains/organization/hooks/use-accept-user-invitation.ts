import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

export interface AcceptUserInvitationVariables {
  id: string;
  organizationId: string;
}

/**
 * Accept an invitation addressed to the signed-in user. `onAccepted` receives the joined
 * organization id (the caller makes it the active one).
 */
export function useAcceptUserInvitation({
  onAccepted,
}: { onAccepted?: (organizationId: string) => void } = {}) {
  return useMutation({
    mutationFn: async (invitation: AcceptUserInvitationVariables) => {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId: invitation.id,
      });
      if (error) {
        throw new Error(messageOr(error.message, "Couldn't accept"));
      }
      return invitation.organizationId;
    },
    onSuccess: (organizationId) => {
      onAccepted?.(organizationId);
    },
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't accept the invitation"));
    },
  });
}
