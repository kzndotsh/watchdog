import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { errMessage, messageOr } from "@/lib/utils";
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
        throw new Error(messageOr(error.message, "Couldn't cancel invitation"));
    },
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.team() }),
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't cancel invitation"));
    },
  });
}
