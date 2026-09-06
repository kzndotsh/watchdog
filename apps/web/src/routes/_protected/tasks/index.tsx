import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { casesContextQuery } from "@/domains/cases/queries";
import { TasksPage } from "@/domains/tasks/components/tasks-page";
import { warmTasksQueries } from "@/domains/tasks/lib/prefetch-tasks";
import { ensureAppQueryData } from "@/shared/lib/warm-query";
import { uuidSchema } from "@watchdog/schemas";

const routeApi = getRouteApi("/_protected/tasks/");

function TasksRoutePage() {
  const { entityId } = routeApi.useSearch();
  return <TasksPage entityId={entityId} />;
}

export const Route = createFileRoute("/_protected/tasks/")({
  validateSearch: z.object({
    entityId: uuidSchema.optional(),
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
