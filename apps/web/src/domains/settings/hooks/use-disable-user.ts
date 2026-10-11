import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { usersKeys } from "@/domains/settings/queries";
import { couldnt, errMessage, messageOr } from "@/lib/utils";
import { TOAST_USER_DISABLED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

/** Disable (ban) a user (variable: the user id), then refresh the user list. */
export function useDisableUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.banUser({
        userId,
        banReason: "disabled",
      });
      if (error)
        throw new Error(messageOr(error.message, couldnt("disable", "user")));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.all });
      toast.success(TOAST_USER_DISABLED);
    },
    onError: (error) => {
      toast.error(errMessage(error, couldnt("disable", "user")));
    },
  });
}
