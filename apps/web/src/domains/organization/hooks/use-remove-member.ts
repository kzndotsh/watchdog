import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

/** Remove a member (variable: member id or email), then refresh the team list. */
export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail,
      });
      if (error)
        throw new Error(messageOr(error.message, "Couldn't remove member"));
    },
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.team() }),
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't remove member"));
    },
  });
}
