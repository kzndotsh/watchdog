import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { organizationKeys } from "@/domains/organization/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

export type InviteMemberVariables = {
  email: string;
  role: "member" | "admin";
};

/** Invite someone by email, then refresh the team list. */
export function useInviteMember({
  onInvited,
}: { onInvited?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: InviteMemberVariables) => {
      const { error } = await authClient.organization.inviteMember({
        email,
        role,
      });
      if (error)
        throw new Error(
          messageOr(error.message, couldnt("send", "invitation"))
        );
    },
    onSuccess: async () => {
      onInvited?.();
      toast.success(
        "Invitation created. Copy the link if mail is not configured."
      );
      await queryClient.invalidateQueries({
        queryKey: organizationKeys.team(),
      });
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("send", "invitation")));
    },
  });
}
