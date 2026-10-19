import { apiKeyQueryKeys } from "@better-auth-ui/core/plugins/api-key";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createApiKeyFn } from "@/auth/api-key.functions";
import type { CreateApiKeyInput } from "@watchdog/schemas/shared";

/**
 * Create an API key through the session-only server function (scopes and organization are
 * set on the server), then refresh the key list. The result carries the plaintext key once.
 */
export function useCreateApiKey(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApiKeyInput) =>
      createApiKeyFn({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeyQueryKeys.lists(userId),
      });
    },
  });
}
