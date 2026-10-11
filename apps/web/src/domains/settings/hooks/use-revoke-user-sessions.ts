import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { usersKeys } from "@/domains/settings/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { TOAST_SESSIONS_REVOKED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

/** Sign a user out of every session (variable: the user id), then refresh the user list. */
export function useRevokeUserSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.revokeUserSessions({ userId });
      if (error) {
        throw new Error(
          messageOr(error.message, couldnt("sign out", "sessions"))
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.all });
      toast.success(TOAST_SESSIONS_REVOKED);
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("sign out", "sessions")));
    },
  });
}
