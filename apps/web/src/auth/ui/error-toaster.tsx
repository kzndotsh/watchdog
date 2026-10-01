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
import { useEffect } from "react";

import { firstNonEmpty } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

import { authErrorDetails } from "./auth-error";

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

      const details = authErrorDetails(error);
      if (details.code === "EMAIL_NOT_VERIFIED") return;
      if (details.fromServer && details.message !== undefined) {
        toast.error(details.message);
      }
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

      const details = authErrorDetails(error);
      if (details.code === "EMAIL_NOT_VERIFIED") return;
      toast.error(firstNonEmpty(details.message) ?? "Something went wrong");
    };

    return () => {
      queryCache.config.onError = previousQueryOnError;
      mutationCache.config.onError = previousMutationOnError;
    };
  }, [queryClient]);

  return null;
}
