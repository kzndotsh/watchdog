import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { taskByIdQuery } from "@/domains/tasks/queries";
import type { TaskListItem, TaskRecord } from "@/domains/tasks/types";
import { couldnt, errMessage } from "@/lib/utils";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { toast } from "@/shared/ui/toast";

/** Shown when a `?taskId=` link names a Task the Case no longer holds. */
export const TASK_LINK_GONE = "That task is no longer in this Case.";

type TaskDeepLinkArgs = {
  readonly caseId: string;
  /** `?taskId=`; undefined without a link. */
  readonly taskId: string | undefined;
  /** The board has its own view's cards (not pending, not the previous view's). */
  readonly isBoardReady: boolean;
  /** The cards on the board: open ones, then the loaded Done and Dropped pages. */
  readonly tasks: readonly TaskListItem[];
  /** Drop `?taskId=` from the URL. */
  readonly onClear: () => void;
};

export type TaskDeepLink = {
  /** The linked Task, from the board or read by id; null while unknown or without a link. */
  readonly task: TaskRecord | null;
  /** The by-id read failed: the copy for the error state. */
  readonly error: string | null;
  readonly retry: () => void;
};

/**
 * `?taskId=` names the card whose dialog is open (the Dossier Evidence tab's `?id=` model,
 * `useSelectedEvidence`). A card on the board is used as is; only once the board has its view
 * without it is the Task read by id (`tasks.get`: a Done card past the first page, or one the
 * filters hide). The screen derives its dialog from `task` and drops the link when the dialog
 * closes. A Task the Case no longer holds clears the link with a notice; a failed read is the
 * screen's error state (Retry, Clear link).
 */
export function useTaskDeepLink({
  caseId,
  taskId,
  isBoardReady,
  tasks,
  onClear,
}: TaskDeepLinkArgs): TaskDeepLink {
  const linkedId = scopeOptionalUuid(taskId) ?? null;
  const loaded =
    linkedId === null ? undefined : tasks.find((row) => row.id === linkedId);
  const readId =
    linkedId !== null && loaded === undefined && isBoardReady ? linkedId : null;
  const query = useQuery(taskByIdQuery(caseId, readId));
  const isGone = readId !== null && query.isSuccess && query.data === null;

  // Writing the URL and showing a toast are the external effects of a gone link.
  const clearGone = useEffectEvent(() => {
    toast.info(TASK_LINK_GONE);
    onClear();
  });
  useEffect(() => {
    if (isGone) clearGone();
  }, [isGone]);

  return {
    task: loaded ?? (readId === null ? null : (query.data ?? null)),
    error:
      readId !== null && query.isError
        ? errMessage(query.error, couldnt("open", "the linked task"))
        : null,
    retry: () => {
      void query.refetch();
    },
  };
}
