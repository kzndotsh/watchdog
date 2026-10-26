import { z } from "zod";

import { taskList } from "@watchdog/schemas/feed";
import {
  optionalUuidSchema,
  type UnfixedSearch,
  type UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

/** The board's Done column: the Task list with `status` fixed (never in the URL). */
export const DONE_COLUMN = { status: ["done"] } as const;
/** The board's Dropped column. */
export const DROPPED_COLUMN = { status: ["dropped"] } as const;

/**
 * The Tasks route's search (ADR-0007): the Task list's view (`entityId`, `priority`, `q`, `sort`),
 * which every column reads, plus `taskId` (a link that opens one card). `status` is each finished
 * column's fixed filter and the board's own columns, so a hand-typed one is dropped; `sort`
 * orders Done and Dropped (the open columns keep their manual order).
 */
export type TasksSearch = UnfixedSearch<typeof taskList, "status"> & {
  readonly taskId?: string;
};

export type TasksSearchPatch = UnfixedSearchPatch<typeof taskList, "status"> & {
  readonly taskId?: string | undefined;
};

const tasksRouteSearch = taskList.searchWith({
  taskId: z.preprocess(
    (value) => optionalUuidSchema.safeParse(value).data,
    z.string().optional()
  ),
});

/** Parse the Tasks URL: never throws; a bad or fixed param is dropped. */
export function parseTasksSearch(
  raw: Readonly<Record<string, unknown>>
): TasksSearch {
  const { status: _fixed, ...search } = tasksRouteSearch.parse(raw);
  return search;
}
