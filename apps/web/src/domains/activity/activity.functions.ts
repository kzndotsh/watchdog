import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext } from "@/lib/orpc.server";
import { activityList, type ActivityItem } from "@watchdog/schemas/feed";
import type { ListPage } from "@watchdog/schemas/shared";

/** One page of Recent activity (`activityList`, ADR-0007): the organization's feed, or one Case's. */
export const listRecentActivityFn = createServerFn({ method: "GET" })
  .validator(activityList.input)
  .handler(async ({ data, context }): Promise<ListPage<ActivityItem>> =>
    orpcFromContext(context).activity.listRecent(data)
  );
