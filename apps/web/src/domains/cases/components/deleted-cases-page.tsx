import { useQuery } from "@tanstack/react-query";

import { DeletedCasesView } from "@/domains/cases/components/deleted-cases-view";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { Alert, AlertDescription } from "@watchdog/ui/components/alert";

function DeletedCasesBody() {
  const { data: policy, isPending } = useQuery(deletionPolicyQuery());

  if (isPending) return <InlineLoading label="Loading…" />;
  if (policy?.canManage === true) return <DeletedCasesView />;
  return (
    <Alert>
      <AlertDescription>
        Only owners and admins can see deleted Cases.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Deleted Cases (`/deleted-cases`): a page of the Cases area for owners and admins. Anyone else
 * gets an inline "can't view" alert (the server refuses the list as well), not an empty list.
 */
export function DeletedCasesPage() {
  return (
    <Page>
      <PageHeader />
      <DeletedCasesBody />
    </Page>
  );
}
