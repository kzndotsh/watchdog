import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { entryKey } from "@/domains/library/lib/library-entries";
import type { LibraryEntry, LibraryEntryKind } from "@/domains/library/types";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { LIBRARY_ENTRY_PAGE_CLASS } from "@/shared/ui/library-shell";
import { LoadingRegion } from "@/shared/ui/loading-region";
import { Button } from "@/shared/ui/primitives/button";
import { LibraryEntrySkeleton } from "@/shared/ui/skeletons/library/library-entry-skeleton";

export type LibraryEntryLoaderProps = {
  kind: LibraryEntryKind;
  id: string;
  /** The kind's own page body (header, facts, columns). */
  children: (entry: LibraryEntry) => ReactNode;
};

/**
 * Finds a Library entry by kind and id and frames it, or shows its skeleton, a load error or
 * not found. A failed catalog read stays visible with Retry above the body even once the entry
 * is found, since the body may depend on the list that failed.
 */
export function LibraryEntryLoader({
  kind,
  id,
  children,
}: LibraryEntryLoaderProps) {
  const data = useLibraryData();
  const handleRetry = data.retry;
  const entry = data.entries.find((row) => row.key === entryKey(kind, id));
  const noun = kind === "cap" ? "Cap" : "Playbook";

  if (entry !== undefined) {
    return (
      // gap-0, as Settings: the page body starts right under the header, so the back link's row
      // lines up with the app sidebar's first label.
      <Page className="gap-0">
        <PageHeader />
        <div className={LIBRARY_ENTRY_PAGE_CLASS}>
          {data.loadError === null ? null : (
            <FetchErrorAlert error={data.loadError} onRetry={handleRetry} />
          )}
          {children(entry)}
        </div>
      </Page>
    );
  }
  if (data.isPending) {
    return (
      <Page className="gap-0">
        <PageHeader />
        <LoadingRegion label={`Loading the ${noun}…`}>
          <LibraryEntrySkeleton />
        </LoadingRegion>
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
        title={`${noun} not found`}
        description={`No ${noun} in the Library has this id.`}
      >
        <Button
          nativeButton={false}
          render={<Link to="/library" search={{ kind: undefined }} />}
        >
          Back to the Library
        </Button>
      </RouteNotFoundCenter>
    </Page>
  );
}
