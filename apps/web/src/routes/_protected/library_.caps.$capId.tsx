import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { LibraryCapPage } from "@/domains/library/components/library-cap-page";
import { warmLibraryQueries } from "@/domains/library/lib/prefetch-library";
import { RouteError } from "@/shared/layout/route-error";

const routeApi = getRouteApi("/_protected/library_/caps/$capId");

function LibraryCapRoute() {
  const { capId } = routeApi.useParams();
  return <LibraryCapPage capId={capId} />;
}

/** A Cap's Library page. The trailing underscore keeps it out of the `/library` page's layout. */
export const Route = createFileRoute("/_protected/library_/caps/$capId")({
  loader: ({ context: { queryClient } }) => {
    warmLibraryQueries(queryClient);
  },
  errorComponent: RouteError,
  component: LibraryCapRoute,
});
