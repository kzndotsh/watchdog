import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { invalidateAfterOrganizationChange } from "@/shared/lib/query-invalidation";
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
        throw new Error(messageOr(error.message, couldnt("remove", "member")));
    },
    onSuccess: async () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.team() }),
        // Removing yourself changes your own organization state.
        invalidateAfterOrganizationChange(queryClient),
      ]),
    onError: (error) => {
      toast.error(errMessage(error, couldnt("remove", "member")));
    },
  });
}
