import { queryOptions } from "@tanstack/react-query";

import { listCredentialsFn } from "@/domains/settings/settings.functions";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_STABLE, STALE_STABLE } from "@/shared/lib/query-stale";

export const credentialsKeys = {
  all: ["credentials"] as const,
};

export const credentialsListQuery = () => {
  const queryKey = credentialsKeys.all;
  return queryOptions({
    queryKey,
    queryFn: async () => listCredentialsFn(),
    staleTime: STALE_STABLE,
    gcTime: GC_STABLE,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
