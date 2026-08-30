import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { listRecentActivityFn } from "@/domains/activity/activity.functions";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export interface RecentActivityFilters {
  caseId?: string;
  limit?: number;
}

export const activityKeys = {
  all: ["activity"] as const,
  recent: (filters?: RecentActivityFilters) =>
    ["activity", "recent", filters ?? {}] as const,
};

export const recentActivityQuery = (filters?: RecentActivityFilters) =>
  queryOptions({
    queryKey: activityKeys.recent(filters),
    queryFn: async () =>
      listRecentActivityFn({
        data: {
          caseId: filters?.caseId,
          limit: filters?.limit,
        },
      }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: keepPreviousData,
  });
