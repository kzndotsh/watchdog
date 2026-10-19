import type { PagedQuery } from "@/shared/hooks/use-fetch-more-until";
import { Button } from "@/shared/ui/primitives/button";

type LoadMoreProps = {
  /** The infinite query that feeds the list. */
  query: Pick<
    PagedQuery,
    "fetchNextPage" | "hasNextPage" | "isFetchingNextPage"
  >;
  label?: string;
};

/** "Show more" under a paged list; renders nothing on the last page. */
export function LoadMore({ query, label = "Show more" }: LoadMoreProps) {
  if (!query.hasNextPage) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      loading={query.isFetchingNextPage}
      onClick={() => {
        void query.fetchNextPage();
      }}
    >
      {label}
    </Button>
  );
}
