import {
  authMutationKeys,
  authQueryKeys,
  getAuthErrorPresentation,
  isPasswordCompromisedError,
} from "@better-auth-ui/core";
import {
  matchMutation,
  matchQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { BetterFetchError } from "better-auth/react";
import { useEffect } from "react";

import { firstNonEmpty } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

/**
 * Toasts Better Auth UI query/mutation errors. Errors a form renders itself (a
 * `presentation` other than "toast", or a breached password shown on the field) are skipped.
 */
export function ErrorToaster() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const queryCache = queryClient.getQueryCache();
    const previousQueryOnError = queryCache.config.onError;

    queryCache.config.onError = (error, query) => {
      previousQueryOnError?.(error, query);

      if (!matchQuery({ queryKey: authQueryKeys.all }, query)) return;
      if (getAuthErrorPresentation(query.meta) !== "toast") return;

      const err = error as BetterFetchError;
      if (err?.error?.code === "EMAIL_NOT_VERIFIED") return;
      if (err?.error) toast.error(err.error.message);
    };

    const mutationCache = queryClient.getMutationCache();
    const previousMutationOnError = mutationCache.config.onError;

    mutationCache.config.onError = (
      error,
      variables,
      onMutateResult,
      mutation,
      context
    ) => {
      previousMutationOnError?.(
        error,
        variables,
        onMutateResult,
        mutation,
        context
      );

      if (!matchMutation({ mutationKey: authMutationKeys.all }, mutation)) {
        return;
      }
      if (getAuthErrorPresentation(mutation.meta) !== "toast") return;
      // Forms that set a new password render this against the field: a toast repeats it.
      if (isPasswordCompromisedError(error)) return;

      const err = error as BetterFetchError;
      if (err.error?.code === "EMAIL_NOT_VERIFIED") return;
      toast.error(
        firstNonEmpty(err.error?.message, err.message) ?? err.message
      );
    };

    return () => {
      queryCache.config.onError = previousQueryOnError;
      mutationCache.config.onError = previousMutationOnError;
    };
  }, [queryClient]);

  return null;
}
