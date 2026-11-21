import { apiKeyQueryKeys } from "@better-auth-ui/core/plugins/api-key";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";
import { couldnt } from "@/lib/utils";
import type { CreateApiKeyInput } from "@watchdog/domain/schemas/shared";

/** What the create endpoint answers: the plaintext key, shown once. */
export type CreatedApiKey = { id: string; name: string | null; key: string };

/**
 * Create an API key through the session-only Better Auth endpoint
 * (`/api-key/create-scoped`, `@watchdog/auth`: scopes and organization are set on the server),
 * then refresh the key list. The result carries the plaintext key once.
 */
export function useCreateApiKey(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApiKeyInput) => {
      const { data, error } = await authClient.$fetch<CreatedApiKey>(
        "/api-key/create-scoped",
        { method: "POST", body: input }
      );
      if (error || !data) {
        throw new Error(
          error?.message ?? error?.statusText ?? couldnt("create", "API key")
        );
      }
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: apiKeyQueryKeys.lists(userId),
      });
    },
  });
}
