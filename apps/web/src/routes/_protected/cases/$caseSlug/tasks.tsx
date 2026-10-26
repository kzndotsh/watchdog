import {
  createFileRoute,
  getRouteApi,
  type SearchSchemaInput,
} from "@tanstack/react-router";

import { TasksPage } from "@/domains/tasks/components/tasks-page";
import { warmTasksQueries } from "@/domains/tasks/lib/prefetch-tasks";
import {
  parseTasksSearch,
  type TasksSearch,
} from "@/domains/tasks/lib/tasks-search";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/tasks");

function TasksRoutePage() {
  const search = routeApi.useSearch();
  const onSearchChange = usePatchSearch();
  return <TasksPage search={search} onSearchChange={onSearchChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/tasks")({
  validateSearch: (raw: TasksSearch & SearchSchemaInput) =>
    parseTasksSearch(raw),
  // The view and `taskId` live in the URL and the board follows them: a filter, a search or a
  // card link never re-runs the loader.
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient, workCase }, location }) => {
    warmTasksQueries(
      queryClient,
      workCase.id,
      parseTasksSearch(location.search)
    );
  },
  component: TasksRoutePage,
});
