import { z } from "zod";

import { parseCollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import { collectList } from "@watchdog/schemas/jobs";
import {
  optionalUuidSchema,
  type ListSearch,
  type UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

/**
 * The Collect route's search (ADR-0007): the queue's view (`q`, `sort`, the filters) plus the
 * selected row and the Library's one-shot `run` link. A bad `id` or `run` is dropped, never an
 * error page. `id` is a row id, a member Job's id or a playbook run's id.
 */
export const collectSearchSchema = collectList.searchWith({
  id: z.preprocess(
    (value) => optionalUuidSchema.safeParse(value).data,
    z.string().optional()
  ),
  run: z
    .unknown()
    .optional()
    .transform((value) =>
      typeof value === "string" && parseCollectRunTarget(value) !== undefined
        ? value
        : undefined
    ),
});

export type CollectSearch = ListSearch<typeof collectList> & {
  readonly id?: string | undefined;
  readonly run?: string | undefined;
};

export type CollectSearchPatch = UnfixedSearchPatch<
  typeof collectList,
  never
> & {
  readonly id?: string | undefined;
  readonly run?: string | undefined;
};
