import {
  LibrarySplit,
  type LibrarySplitProps,
} from "@/domains/library/components/library-split";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";

export type LibraryProps = Pick<
  LibrarySplitProps,
  "selectedKey" | "inputKind" | "onSelectedKeyChange" | "onInputKindChange"
>;

/** The Library page (`/library`): every Cap and Playbook for the organization. */
export function Library(props: LibraryProps) {
  const data = useLibraryData();
  const handleRetry = data.retry;
  return (
    <Page density="split">
      <PageHeader />
      <LibrarySplit
        {...props}
        entries={data.entries}
        isPending={data.isPending}
        isPlaceholder={data.isPlaceholder}
        loadError={data.loadError}
        onRetry={handleRetry}
      />
    </Page>
  );
}
