import { Link } from "@tanstack/react-router";

import { LibraryCapDetail } from "@/domains/library/components/library-cap-detail";
import { LibraryEntryPage } from "@/domains/library/components/library-entry-page";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { entryKey } from "@/domains/library/lib/library-entries";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { Button } from "@/shared/ui/primitives/button";

export type LibraryCapPageProps = {
  capId: string;
};

/** A Cap's own page (`/library/caps/$capId`): the shared entry frame around the Cap body. */
export function LibraryCapPage({ capId }: LibraryCapPageProps) {
  const data = useLibraryData();
  const handleRetry = data.retry;
  const entry = data.entries.find((row) => row.key === entryKey("cap", capId));

  if (entry !== undefined) {
    return (
      <LibraryEntryPage entry={entry}>
        {data.loadError === null ? null : (
          <FetchErrorAlert error={data.loadError} onRetry={handleRetry} />
        )}
        <LibraryCapDetail entry={entry} />
      </LibraryEntryPage>
    );
  }
  if (data.isPending) {
    return (
      <Page>
        <PageHeader />
        <InlineLoading label="Loading the Cap…" />
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
        title="Cap not found"
        description="No Cap in the Library has this id."
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
