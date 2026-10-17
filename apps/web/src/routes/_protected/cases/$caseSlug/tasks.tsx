import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { TasksPage } from "@/domains/tasks/components/tasks-page";
import { warmTasksQueries } from "@/domains/tasks/lib/prefetch-tasks";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/tasks");

function TasksRoutePage() {
  const { entityId, taskId } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const handleTaskIdChange = useCallback(
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
      onTaskIdChange={handleTaskIdChange}
    />
  );
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/tasks")({
  validateSearch: z.object({
    entityId: optionalUuidSchema,
    taskId: optionalUuidSchema,
  }),
  loaderDeps: ({ search: { entityId } }) => ({ entityId }),
  loader: ({ context: { queryClient, workCase }, deps: { entityId } }) => {
    warmTasksQueries(
      queryClient,
      workCase.id,
      entityId ? { entityId } : undefined
    );
  },
  component: TasksRoutePage,
});
