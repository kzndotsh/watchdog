import { createServerFn } from "@tanstack/react-start";

import {
  listRecentActivityInputSchema,
  type ActivityItem,
} from "@/domains/activity/types";
import { orpcFromContext } from "@/lib/orpc.server";

export const listRecentActivityFn = createServerFn({ method: "GET" })
  .validator(listRecentActivityInputSchema)
  .handler(async ({ data, context }): Promise<ActivityItem[]> =>
    orpcFromContext(context).activity.listRecent(data)
  );
