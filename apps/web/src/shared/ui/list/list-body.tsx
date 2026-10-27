import type { ReactNode } from "react";

import type { ListHandle } from "@/shared/lib/list/list-types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { ListEmpty } from "@/shared/ui/list/list-empty";
import { ListFooter } from "@/shared/ui/list/list-footer";
import { PendingRegion } from "@/shared/ui/pending-region";
import type { AnyListDef, FilterKey } from "@watchdog/schemas/shared";

type ListBodyProps<D extends AnyListDef, Item, K extends FilterKey<D>> = {
  readonly list: ListHandle<D, Item, K>;
  /** The layout kind's skeleton (`CollectQueueSkeleton`, `BoardSkeleton`, ...). */
  readonly skeleton: ReactNode;
  /** The screen's add action for "No <noun> yet". */
  readonly blankSlateAction?: ReactNode;
  /**
   * A board column draws nothing when nothing exists, like the board's other columns; a filter
   * that matches nothing still says so, with Clear filters.
   */
  readonly shouldHideBlank?: boolean;
  readonly children: (rows: readonly Item[]) => ReactNode;
};

/**
 * The state switch every non-table list shares (a queue, a list, a grid, a board column), in
 * loading.md order: pending → the skeleton in a `PendingRegion`; error → the alert and Retry;
 * blank → "No <noun> yet" and the add action; no-match → "Nothing matches these filters" and
 * Clear filters; ready → the rows (de-emphasised while the previous view's rows stand in, a
 * failed refresh as an alert above them). Every state fills the same column, and the footer
 * (count, Load more, the ceiling) closes it.
 */
export function ListBody<D extends AnyListDef, Item, K extends FilterKey<D>>({
  list,
  skeleton,
  blankSlateAction,
  shouldHideBlank = false,
  children,
}: ListBodyProps<D, Item, K>) {
  const { status, def } = list;
  return (
    <div
      data-slot="list-body"
      className="flex min-h-0 flex-1 flex-col gap-2"
      aria-busy={list.isUpdating || undefined}
    >
      {status === "pending" ? (
        <PendingRegion
          isLoading
          label={`Loading ${def.noun.many}`}
          fallback={skeleton}
          className="flex min-h-0 flex-1 flex-col"
        >
          {null}
        </PendingRegion>
      ) : null}
      {status === "error" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <FetchErrorAlert
            error={list.error}
            onRetry={() => {
              list.retry();
            }}
          />
        </div>
      ) : null}
      {(status === "blank" && !shouldHideBlank) || status === "no-match" ? (
        <ListEmpty
          status={status}
          noun={def.noun}
          action={blankSlateAction}
          onClearFilters={() => {
            list.controls.reset();
          }}
        />
      ) : null}
      {status === "ready" ? (
        <>
          <FetchErrorAlert
            error={list.error}
            onRetry={() => {
              list.retry();
            }}
          />
          <div
            className={`flex min-h-0 flex-1 flex-col ${placeholderDeemphasisClass(list.isUpdating)}`}
          >
            {children(list.rows)}
          </div>
        </>
      ) : null}
      <ListFooter
        status={status}
        count={list.count}
        more={list.more}
        noun={def.noun}
      />
    </div>
  );
}
