import { orpc } from "@/lib/orpc-client";
import { listView } from "@/shared/lib/list/list-view";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { activityList, type ActivityItem } from "@watchdog/domain/schemas/feed";

/** Recent activity keys are the oRPC procedure keys: `all` is every `activity.*` query. */
export const activityKeys = {
  all: orpc.activity.key(),
};

/** Recent activity has no scope: the organization comes from the caller. */
type ActivityListScope = Record<string, never>;

/**
 * Recent activity (`activityList`, ADR-0007), newest first, a page per fetch through
 * `activity.listRecent`, for the dashboard and Case feeds. Keys sit under `activityKeys.all`, so
 * every contract that soft-invalidates the feed refreshes each view.
 */
export const activityListView = listView(activityList, {
  procedure: orpc.activity.listRecent,
  scopeInput: (_scope: ActivityListScope) => ({}),
  input: ({ params, cursor }) => ({
    ...params,
    ...(cursor === undefined ? {} : { cursor }),
  }),
  getId: (item: ActivityItem) => item.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
  // The feed has always paged to the end, so it keeps no ceiling (no selection, light rows).
  maxPages: Number.POSITIVE_INFINITY,
});
