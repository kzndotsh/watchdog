import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteCredentialFn } from "@/domains/settings/settings.functions";
import { invalidateAfterCredentialMutation } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { deleteCredentialInputSchema } from "@watchdog/schemas/caps";

/**
 * Delete a credential slot (variable: its name). `onDeleted` closes the dialog and runs
 * after the toast; the cache settle is fired without being awaited, as before.
 */
export function useDeleteCredential({
  onDeleted,
  onFailed,
}: {
  onDeleted?: () => void;
  onFailed?: (error: unknown) => void;
} = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      deleteCredentialFn({ data: deleteCredentialInputSchema.parse({ name }) }),
    onSuccess: () => {
      toast.success("Credential removed");
      onDeleted?.();
      void invalidateAfterCredentialMutation(queryClient);
    },
    onError: (error) => {
      onFailed?.(error);
    },
  });
}
