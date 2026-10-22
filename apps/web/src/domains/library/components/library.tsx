import {
  LibraryBrowser,
  type LibraryBrowserProps,
} from "@/domains/library/components/library-browser";
import { useLibraryData } from "@/domains/library/hooks/use-library-data";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";

export type LibraryProps = Pick<
  LibraryBrowserProps,
  "search" | "onSearchChange"
>;

/** The Library page (`/library`): every Cap and Playbook for the organization, as a card grid. */
export function Library(props: LibraryProps) {
  const data = useLibraryData();
  const handleRetry = data.retry;
  return (
    <Page className="min-h-0 overflow-hidden">
      <PageHeader />
      <LibraryBrowser
        {...props}
        entries={data.entries}
        isPending={data.isPending}
        isPlaceholder={data.isPlaceholder}
        loadError={data.loadError}
        keysError={data.keysError}
        onRetry={handleRetry}
      />
    </Page>
  );
}
