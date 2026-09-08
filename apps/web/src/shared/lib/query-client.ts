import { QueryCache, QueryClient } from "@tanstack/react-query";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { toast } from "@/shared/ui/shadcn/toast";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return "Request failed";
}

/** Fresh QueryClient per router instance (SSR-safe). Not a module singleton. */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
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
        if (query.meta?.silentError === true) return;
        if (typeof window === "undefined") return;
        toast.error(errorMessage(error));
      },
    }),
  });
}
