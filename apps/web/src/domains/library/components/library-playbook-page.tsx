import { Link } from "@tanstack/react-router";

import { LibraryEntryPage } from "@/domains/library/components/library-entry-page";
import { LibraryPlaybookDetail } from "@/domains/library/components/library-playbook-detail";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { entryKey } from "@/domains/library/lib/library-entries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { Button } from "@/shared/ui/primitives/button";

export type LibraryPlaybookPageProps = {
  playbookId: string;
};

/** A Playbook's own page (`/library/playbooks/$playbookId`): the shared entry frame around the Playbook body. */
export function LibraryPlaybookPage({ playbookId }: LibraryPlaybookPageProps) {
  const data = useLibraryData();
  const handleRetry = data.retry;
  const entry = data.entries.find(
    (row) => row.key === entryKey("playbook", playbookId)
  );

  if (entry !== undefined) {
    return (
      <LibraryEntryPage entry={entry}>
        <LibraryPlaybookDetail entry={entry} />
      </LibraryEntryPage>
    );
  }
  if (data.isPending) {
    return (
      <Page>
        <PageHeader />
        <InlineLoading label="Loading the Playbook…" />
      </Page>
    );
  }
  if (data.loadError !== null) {
    return (
      <Page>
        <PageHeader />
        <FetchErrorAlert error={data.loadError} onRetry={handleRetry} />
      </Page>
    );
  }
  return (
    <Page className="min-h-0">
      <PageHeader />
      <RouteNotFoundCenter
        title="Playbook not found"
        description="No Playbook in the Library has this id."
      >
        <Button
          nativeButton={false}
          render={
            <Link to="/library" search={{ id: undefined, kind: undefined }} />
          }
        >
          Back to the Library
        </Button>
      </RouteNotFoundCenter>
    </Page>
  );
}
