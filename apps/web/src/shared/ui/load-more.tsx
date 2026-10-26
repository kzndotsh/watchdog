import { Button } from "@/shared/ui/primitives/button";

type LoadMoreProps = {
  /** The infinite query that feeds the list (or a list's `more`). */
  query: {
    readonly fetchNextPage: () => Promise<unknown>;
    readonly hasNextPage: boolean;
    readonly isFetchingNextPage: boolean;
  };
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
