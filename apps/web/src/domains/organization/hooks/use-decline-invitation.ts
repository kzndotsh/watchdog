import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

/** Decline an invitation addressed to the signed-in user (variable: its id), then refresh the list. */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (error) {
        throw new Error(
          messageOr(error.message, couldnt("decline", "invitation"))
        );
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: organizationKeys.userInvitations(),
      });
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("decline", "the invitation")));
    },
  });
}
