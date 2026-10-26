import { cn } from "@/lib/utils";
import { LIST_CEILING_HINT } from "@/shared/lib/list/list-copy";
import type {
  ListCountValue,
  ListMore,
  ListStatus,
} from "@/shared/lib/list/list-types";
import { ListCount } from "@/shared/ui/list/list-count";
import { LoadMore } from "@/shared/ui/load-more";

type ListFooterProps = {
  readonly status: ListStatus;
  readonly count: ListCountValue;
  readonly more: ListMore;
  readonly noun: { readonly one: string; readonly many: string };
};

/**
 * Under every list body: "Showing 50 of 1,000+" and Load more, or, at the `LIST_MAX_PAGES`
 * ceiling, "Showing 500 of 1,000+. Narrow the filters to see more." in place of the button.
 * The row stays mounted in every state (it holds the count's live region) and shows nothing
 * while the list is pending, failed or empty.
 */
export function ListFooter({ status, count, more, noun }: ListFooterProps) {
  const isShown = status === "ready";
  return (
    <div
      data-slot="list-footer"
      className={cn(
        "text-muted-foreground flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-xs",
        !isShown && "min-h-0"
      )}
    >
      <ListCount count={count} noun={noun} variant="full" />
      {isShown && count.isAtCeiling ? <span>{LIST_CEILING_HINT}</span> : null}
      {isShown && !count.isAtCeiling ? (
        <LoadMore query={more} label="Load more" />
      ) : null}
    </div>
  );
}
