import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { LibraryEntryPage } from "@/domains/library/components/library-entry-page";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { entryKey } from "@/domains/library/lib/library-entries";
import type { LibraryEntry, LibraryEntryKind } from "@/domains/library/types";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { RouteNotFoundCenter } from "@/shared/layout/route-not-found-center";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { Button } from "@/shared/ui/primitives/button";

export type LibraryEntryLoaderProps = {
  kind: LibraryEntryKind;
  id: string;
  /** The kind's own body, inside the shared entry frame. */
  children: (entry: LibraryEntry) => ReactNode;
};

/**
 * Finds a Library entry by kind and id and frames it, or shows loading, a load error or not
 * found. A failed catalog read stays visible with Retry above the body even once the entry is
 * found, since the body may depend on the list that failed.
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
      <LibraryEntryPage entry={entry}>
        {data.loadError === null ? null : (
          <FetchErrorAlert error={data.loadError} onRetry={handleRetry} />
        )}
        {children(entry)}
      </LibraryEntryPage>
    );
  }
  if (data.isPending) {
    return (
      <Page>
        <PageHeader />
        <InlineLoading label={`Loading the ${noun}…`} />
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
