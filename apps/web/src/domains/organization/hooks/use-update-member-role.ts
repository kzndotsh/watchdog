import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

export interface UpdateMemberRoleVariables {
  memberId: string;
  role: string;
}

/** Change a member's role, then refresh the team list. */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateMemberRoleVariables) => {
      const { error } = await authClient.organization.updateMemberRole(input);
      if (error)
        throw new Error(messageOr(error.message, "Couldn't update role"));
    },
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.team() }),
    onError: (error) => {
      toast.error(errMessage(error, "Couldn't update role"));
    },
  });
}
