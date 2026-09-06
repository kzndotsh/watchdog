import { createFileRoute } from "@tanstack/react-router";

import { CaseList } from "@/domains/cases/components/case-list";
import { casesContextQuery } from "@/domains/cases/queries";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

function CasesPage() {
  return <CaseList />;
}

export const Route = createFileRoute("/_protected/cases/")({
  loader: async ({ context: { queryClient } }) =>
    ensureAppQueryData(queryClient, casesContextQuery()),
  component: CasesPage,
});
