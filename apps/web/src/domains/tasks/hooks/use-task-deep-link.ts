import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { taskByIdQuery } from "@/domains/tasks/queries";
import type { TaskListItem, TaskRecord } from "@/domains/tasks/types";
import { couldnt } from "@/lib/utils";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { toast } from "@/shared/ui/toast";

/** Shown when a `?taskId=` link names a Task the Case no longer holds. */
export const TASK_LINK_GONE = "That task is no longer in this Case.";

/**
 * `?taskId=` opens that card's dialog once, then leaves the URL. A card on the board is opened
 * from the loaded rows; one that is not (a Done card past the first page, or one the view's
 * filters hide) is read by id (`tasks.get`). A Task the Case no longer holds clears the link
 * with a notice; a failed read clears it with the failure.
 */
export function useTaskDeepLink(args: {
  caseId: string;
  taskId: string | undefined;
  isBoardReady: boolean;
  tasks: readonly TaskListItem[];
  onOpen: (task: TaskRecord) => void;
  onDone: () => void;
}) {
  const { caseId, isBoardReady, tasks, onOpen, onDone } = args;
  const taskId = scopeOptionalUuid(args.taskId) ?? null;
  const loaded =
    taskId === null ? undefined : tasks.find((row) => row.id === taskId);
  const byId = useQuery({
    ...taskByIdQuery(caseId, taskId),
    enabled:
      taskId !== null &&
      isBoardReady &&
      loaded === undefined &&
      taskByIdQuery(caseId, taskId).enabled,
  });

  useEffect(() => {
    if (args.taskId === undefined) return;
    if (taskId === null) {
      onDone();
      return;
    }
    if (!isBoardReady) return;
    if (loaded !== undefined) {
      onOpen(loaded);
      onDone();
      return;
    }
    if (byId.isError) {
      toast.error(couldnt("open", "task"));
      onDone();
      return;
    }
    if (!byId.isSuccess) return;
    if (byId.data === null) {
      toast.info(TASK_LINK_GONE);
    } else {
      onOpen(byId.data);
    }
    onDone();
  }, [
    args.taskId,
    taskId,
    isBoardReady,
    loaded,
    byId.isError,
    byId.isSuccess,
    byId.data,
    onOpen,
    onDone,
  ]);
}
