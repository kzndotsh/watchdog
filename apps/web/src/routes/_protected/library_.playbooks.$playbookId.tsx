import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { LibraryPlaybookPage } from "@/domains/library/components/library-playbook-page";
import { warmLibraryQueries } from "@/domains/library/lib/prefetch-library";
import { RouteError } from "@/shared/layout/route-error";

const routeApi = getRouteApi("/_protected/library_/playbooks/$playbookId");

function LibraryPlaybookRoute() {
  const { playbookId } = routeApi.useParams();
  return <LibraryPlaybookPage playbookId={playbookId} />;
}

/** A Playbook's Library page. The trailing underscore keeps it out of the `/library` page's layout. */
export const Route = createFileRoute(
  "/_protected/library_/playbooks/$playbookId"
)({
  loader: ({ context: { queryClient } }) => {
    warmLibraryQueries(queryClient);
  },
  errorComponent: RouteError,
  component: LibraryPlaybookRoute,
});
