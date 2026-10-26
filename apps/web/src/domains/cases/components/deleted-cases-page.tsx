import { useQuery } from "@tanstack/react-query";

import { DeletedCasesView } from "@/domains/cases/components/deleted-cases-view";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { InlineLoading } from "@/shared/ui/inline-loading";
import type { deletedCaseList } from "@watchdog/schemas/cases";
import type { ListSearch, ListSearchPatch } from "@watchdog/schemas/shared";
import { Alert, AlertDescription } from "@watchdog/ui/components/alert";

type DeletedCasesPageProps = {
  search: ListSearch<typeof deletedCaseList>;
  onSearchChange: (patch: ListSearchPatch<typeof deletedCaseList>) => void;
};

/**
 * Deleted Cases (`/deleted-cases`): a page of the Cases area for owners and admins. Anyone else
 * gets an inline "can't view" alert (the server refuses the list as well), not an empty list.
 */
export function DeletedCasesPage({
  search,
  onSearchChange,
}: DeletedCasesPageProps) {
  const { data: policy, isPending } = useQuery(deletionPolicyQuery());

  if (policy?.canManage === true) {
    return <DeletedCasesView search={search} onSearchChange={onSearchChange} />;
  }
  return (
    <Page>
      <PageHeader />
      {isPending ? (
        <InlineLoading label="Loading…" />
      ) : (
        <Alert>
          <AlertDescription>
            Only owners and admins can see deleted Cases.
          </AlertDescription>
        </Alert>
      )}
    </Page>
  );
}
