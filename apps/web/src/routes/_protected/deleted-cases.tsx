import { createFileRoute } from "@tanstack/react-router";

import { DeletedCasesPage } from "@/domains/cases/components/deleted-cases-page";
import { RouteError } from "@/shared/layout/route-error";

/** Deleted Cases: restore a deleted Case or purge it now (owners and admins). */
export const Route = createFileRoute("/_protected/deleted-cases")({
  errorComponent: RouteError,
  component: DeletedCasesPage,
});
