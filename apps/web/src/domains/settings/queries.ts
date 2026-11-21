import { queryOptions } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc-client";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_STABLE, STALE_STABLE } from "@/shared/lib/query-stale";

/** Credentials keys are the oRPC procedure keys: `all` is every `credentials.*` query. */
export const credentialsKeys = {
  all: orpc.credentials.key(),
};

export const usersKeys = {
  all: ["auth-admin", "users"] as const,
};

export const credentialsListQuery = () => {
  const queryKey = orpc.credentials.list.queryKey();
  return queryOptions({
    queryKey,
    queryFn: async () => orpc.credentials.list.call(),
    staleTime: STALE_STABLE,
    gcTime: GC_STABLE,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
