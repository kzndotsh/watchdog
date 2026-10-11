import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

/** Cancel a pending invitation (variable: the invitation id), then refresh the team list. */
export function useCancelInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (error)
        throw new Error(
          messageOr(error.message, couldnt("cancel", "invitation"))
        );
    },
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.team() }),
    onError: (error) => {
      toast.error(errMessage(error, couldnt("cancel", "invitation")));
    },
  });
}
