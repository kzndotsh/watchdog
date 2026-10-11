import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { usersKeys } from "@/domains/settings/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { TOAST_USER_ENABLED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

/** Enable (unban) a user (variable: the user id), then refresh the user list. */
export function useEnableUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.unbanUser({ userId });
      if (error)
        throw new Error(messageOr(error.message, couldnt("enable", "user")));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.all });
      toast.success(TOAST_USER_ENABLED);
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("enable", "user")));
    },
  });
}
