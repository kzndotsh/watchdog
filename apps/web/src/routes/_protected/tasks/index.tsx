import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { casesContextQuery } from "@/domains/cases/queries";
import { TasksPage } from "@/domains/tasks/components/tasks-page";
import { warmTasksQueries } from "@/domains/tasks/lib/prefetch-tasks";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { optionalUuidSchema } from "@watchdog/schemas";

const routeApi = getRouteApi("/_protected/tasks/");

function TasksRoutePage() {
  const { entityId, taskId } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const onTaskIdChange = useCallback(
    (next: string | undefined) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          taskId: next,
        }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <TasksPage
      entityId={entityId}
      taskId={taskId}
      onTaskIdChange={onTaskIdChange}
    />
  );
}

export const Route = createFileRoute("/_protected/tasks/")({
  validateSearch: z.object({
    entityId: optionalUuidSchema,
    taskId: optionalUuidSchema,
  }),
  loaderDeps: ({ search: { entityId } }) => ({ entityId }),
  loader: async ({ context: { queryClient }, deps: { entityId } }) => {
    const { active } = await ensureAppQueryData(
      queryClient,
      casesContextQuery()
    );
    if (!active) return;
    warmTasksQueries(
      queryClient,
      active.id,
      entityId ? { entityId } : undefined
    );
  },
  component: TasksRoutePage,
});
