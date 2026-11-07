import { listRecentActivityFn } from "@/domains/activity/activity.functions";
import { listView } from "@/shared/lib/list/list-view";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { activityList, type ActivityItem } from "@watchdog/schemas/feed";

export const activityKeys = {
  all: ["activity"] as const,
};

/** Recent activity has no scope: the organization comes from the caller. */
type ActivityListScope = Record<string, never>;

/**
 * Recent activity (`activityList`, ADR-0007), newest first, a page per fetch, for the dashboard
 * and Case feeds. Keys sit under `activityKeys.all`, so every contract that soft-invalidates the
 * feed refreshes each view.
 */
export const activityListView = listView(activityList, {
  domain: "activity",
  scopeKey: (_scope: ActivityListScope) => [],
  fetchPage: async ({ params, cursor }) =>
    listRecentActivityFn({
      data: { ...params, ...(cursor === undefined ? {} : { cursor }) },
    }),
  getId: (item: ActivityItem) => item.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
  // The feed has always paged to the end, so it keeps no ceiling (no selection, light rows).
  maxPages: Number.POSITIVE_INFINITY,
});
