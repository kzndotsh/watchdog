import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext } from "@/lib/orpc.server";
import {
  listGraphHistoryInputSchema,
  type GraphHistoryPage,
} from "@watchdog/schemas/graph";

export const listGraphHistoryFn = createServerFn({ method: "GET" })
  .validator(listGraphHistoryInputSchema)
  .handler(async ({ data, context }): Promise<GraphHistoryPage> =>
    orpcFromContext(context).history.list(data)
  );
