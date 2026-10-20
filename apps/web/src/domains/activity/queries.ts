import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";

import { listRecentActivityFn } from "@/domains/activity/activity.functions";
import {
  type RecentActivityFilters,
  parseListRecentActivityInput,
  scopeRecentActivityFilters,
  scopeRecentActivityEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import type { ActivityItem } from "@watchdog/schemas/feed";
import type { Page } from "@watchdog/schemas/shared";

export type { RecentActivityFilters };

export const activityKeys = {
  all: ["activity"] as const,
  recent: (filters?: RecentActivityFilters) =>
    ["activity", "recent", filters ?? {}] as const,
};

/** Recent activity, newest first, a page per fetch; `data` is the loaded entries flattened. */
export const recentActivityQuery = (filters?: RecentActivityFilters) => {
  const scopedFilters = scopeRecentActivityFilters(filters);
  const queryKey = activityKeys.recent(scopedFilters);
  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam }): Promise<Page<ActivityItem>> =>
      listRecentActivityFn({
        data: parseListRecentActivityInput(scopedFilters, pageParam),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data: InfiniteData<Page<ActivityItem>, string | undefined>) =>
      data.pages.flatMap((page) => page.items),
    enabled: scopeRecentActivityEnabled(filters),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData:
      placeholderDataForQueryKey<
        InfiniteData<Page<ActivityItem>, string | undefined>
      >(queryKey),
  });
};
