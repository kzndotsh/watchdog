import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";
import type { CollectLocatedItem, CollectQueueItem } from "@watchdog/core/jobs";
import { collectList, locateCollectInputSchema } from "@watchdog/schemas/jobs";
import type { ListPage } from "@watchdog/schemas/shared";

/** One page of Collect's queue (`collectList`, ADR-0007): the declared filters, `q`, sort and cursor pass through whole. */
export const listCollectPageFn = createServerFn({ method: "GET" })
  .validator(collectList.input)
  .handler(async ({ data, context }): Promise<ListPage<CollectQueueItem>> =>
    orpcFromContext(context).collect.list(data)
  );

/**
 * The row an id belongs to (a row id, a member Job's id, or a run whose steps all attached to
 * Evidence) with the Job to focus: a URL selection the loaded pages do not hold. Null when the
 * Case has nothing for it.
 */
export const getCollectItemFn = createServerFn({ method: "GET" })
  .validator(locateCollectInputSchema)
  .handler(async ({ data, context }): Promise<CollectLocatedItem | null> =>
    orpcNullIfNotFound(orpcFromContext(context).collect.get(data))
  );
