import { queryOptions } from "@tanstack/react-query";

import { listRecentActivityFn } from "@/domains/activity/activity.functions";
import type { ListRecentActivityInput } from "@/domains/activity/types";
import {
  parseListRecentActivityInput,
  scopeRecentActivityFilters,
  scopeRecentActivityEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export type RecentActivityFilters = Partial<ListRecentActivityInput>;

export const activityKeys = {
  all: ["activity"] as const,
  recent: (filters?: RecentActivityFilters) =>
    ["activity", "recent", filters ?? {}] as const,
};

export const recentActivityQuery = (filters?: RecentActivityFilters) => {
  const scopedFilters = scopeRecentActivityFilters(filters);
  const queryKey = activityKeys.recent(scopedFilters);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listRecentActivityFn({
        data: parseListRecentActivityInput(scopedFilters),
      }),
    enabled: scopeRecentActivityEnabled(filters),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
