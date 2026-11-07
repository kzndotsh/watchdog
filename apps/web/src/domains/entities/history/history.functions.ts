import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext } from "@/lib/orpc.server";
import {
  graphHistoryList,
  graphHistoryRowInputSchema,
  type GraphHistoryAttribution,
  type GraphHistoryEntry,
} from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

/** One page of a Graph row's history (`graphHistoryList`, ADR-0007). */
export const listGraphHistoryFn = createServerFn({ method: "GET" })
  .validator(graphHistoryList.input)
  .handler(async ({ data, context }): Promise<ListPage<GraphHistoryEntry>> =>
    orpcFromContext(context).history.list(data)
  );

/** Who created and last changed a Graph row as it stands now; null once it is deleted. */
export const graphRowAttributionFn = createServerFn({ method: "GET" })
  .validator(graphHistoryRowInputSchema)
  .handler(async ({ data, context }): Promise<GraphHistoryAttribution | null> =>
    orpcFromContext(context).history.attribution(data)
  );
