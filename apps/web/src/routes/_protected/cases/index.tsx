import { createFileRoute } from "@tanstack/react-router";

import { CaseList } from "@/domains/cases/components/case-list";
import { casesContextQuery } from "@/domains/cases/queries";

function CasesPage() {
  return <CaseList />;
}

export const Route = createFileRoute("/_protected/cases/")({
  loader: async ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(casesContextQuery()),
  component: CasesPage,
});
