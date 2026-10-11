import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { couldnt, messageOr } from "@/lib/utils";

/**
 * Accept the invitation with the signed-in account (variable: the invitation id). The caller
 * shows the error from the returned mutation and navigates in `onAccepted`.
 */
export function useAcceptInvitation({
  onAccepted,
}: { onAccepted?: () => void } = {}) {
  // oxlint-disable-next-line react-doctor/query-mutation-missing-invalidation -- the caller hard-navigates to "/" on success, which discards every cache; there is no mounted screen left to go stale
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (error)
        throw new Error(
          messageOr(error.message, couldnt("accept", "invitation"))
        );
    },
    onSuccess: () => {
      onAccepted?.();
    },
  });
}
