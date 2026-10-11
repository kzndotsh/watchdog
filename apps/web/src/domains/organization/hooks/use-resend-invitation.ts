import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

export type ResendInvitationVariables = {
  email: string;
  role: string;
};

/** Send a pending invitation again, then refresh the team list. */
export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: ResendInvitationVariables) => {
      const { error } = await authClient.organization.inviteMember({
        email: row.email,
        role: row.role === "admin" ? "admin" : "member",
        resend: true,
      });
      if (error)
        throw new Error(
          messageOr(error.message, couldnt("resend", "invitation"))
        );
    },
    onSuccess: async () => {
      toast.success("Invitation sent again.");
      await queryClient.invalidateQueries({
        queryKey: organizationKeys.team(),
      });
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("resend", "invitation")));
    },
  });
}
