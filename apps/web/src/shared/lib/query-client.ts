import { authQueryKeys } from "@better-auth-ui/core";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { isUnauthorizedFailure } from "@/auth/unauthorized-error";
import { couldnt, isServerFailure, serverFailureMessage } from "@/lib/utils";
import {
  GC_DEFAULT,
  STALE_DEFAULT,
  STALE_SESSION,
} from "@/shared/lib/query-stale";
import { toast } from "@/shared/ui/toast";

function errorMessage(error: unknown): string {
  if (isServerFailure(error)) return serverFailureMessage("Couldn't load");
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return couldnt("complete", "request");
}

/**
 * A server function said Unauthorized: the session is gone (revoked elsewhere, expired).
 * Revalidate it now instead of waiting for its stale time, so `useAuthenticate` in the
 * protected layout sees `null` and redirects to sign-in. Not the session query itself,
 * which would loop.
 */
function revalidateSessionOnUnauthorized(
  client: QueryClient,
  error: unknown,
  queryKey?: readonly unknown[]
): void {
  if (typeof window === "undefined") return;
  if (!isUnauthorizedFailure(error)) return;
  if (queryKey && queryKey[0] === authQueryKeys.session[0]) return;
  // Loaded on demand: the entry chunk does not carry every domain's query keys.
  void (async () => {
    const { invalidateAfterUnauthorized } =
      await import("@/shared/lib/query-invalidation");
    await invalidateAfterUnauthorized(client);
  })();
}

/** Fresh QueryClient per router instance (SSR-safe). Not a module singleton. */
export function createAppQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_DEFAULT,
        gcTime: GC_DEFAULT,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const message = errorMessage(error).toLowerCase();
          if (
            message.includes("unauthorized") ||
            message.includes("forbidden") ||
            message.includes("not authenticated")
          ) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        revalidateSessionOnUnauthorized(client, error, query.queryKey);
        if (query.meta?.silentError === true) return;
        if (typeof window === "undefined") return;
        toast.error(errorMessage(error));
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        revalidateSessionOnUnauthorized(client, error);
      },
    }),
  });
  // The session answer is good for as long as the cookie cache can only repeat it.
  client.setQueryDefaults(authQueryKeys.session, { staleTime: STALE_SESSION });
  return client;
}
