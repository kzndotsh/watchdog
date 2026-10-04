import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext } from "@/lib/orpc.server";
import {
  listRecentActivityInputSchema,
  type ActivityItem,
} from "@watchdog/schemas/feed";

export const listRecentActivityFn = createServerFn({ method: "GET" })
  .validator(listRecentActivityInputSchema)
  .handler(async ({ data, context }): Promise<ActivityItem[]> =>
    orpcFromContext(context).activity.listRecent(data)
  );
