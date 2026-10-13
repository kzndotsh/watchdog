import { SectionLabel } from "@/shared/ui/section-label";
import {
  BOARD_SKELETON_COLUMN_COUNT,
  BOARD_SKELETON_CARDS_PER_COLUMN,
} from "@/shared/ui/skeletons/constants";
import {
  TASK_BOARD_COLUMN_SHELL_CLASS,
  TASK_CARD_SHELL_CLASS,
} from "@/shared/ui/task-board-shell";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Task card layout — mirrors TaskCard / TaskCardPreview shell. */
function TaskCardSkeleton({
  showFooter: shouldShowFooter = true,
}: {
  showFooter?: boolean;
}) {
  return (
    <div className={TASK_CARD_SHELL_CLASS}>
      {shouldShowFooter ? (
        <div className="bg-muted/40 flex h-6 items-center gap-1.5 px-2.5">
          <Skeleton className="h-3 w-3 shrink-0 rounded-xs" />
          <Skeleton className="h-3 w-24 shrink-0 rounded-sm" />
        </div>
      ) : null}
      <div className="px-2.5 py-2">
        <Skeleton className="h-4 w-4/5 rounded-sm" />
      </div>
      {shouldShowFooter ? (
        <div className="border-border flex h-6 items-center gap-2 border-t px-2.5">
          <Skeleton className="h-3 w-3 shrink-0 rounded-xs" />
          <Skeleton className="ml-auto h-3 w-12 shrink-0 rounded-sm" />
        </div>
      ) : null}
    </div>
  );
}

/** Task board column layout — matches task-board-column chrome + cards. */
function TaskBoardColumnSkeleton({
  cards = BOARD_SKELETON_CARDS_PER_COLUMN,
}: {
  cards?: number;
}) {
  return (
    <div className={TASK_BOARD_COLUMN_SHELL_CLASS}>
      <header className="border-border bg-background sticky top-0 z-[1] flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-2">
        <SectionLabel as="h3">
          <Skeleton className="inline-block h-3 w-20 align-middle" />
          <Skeleton className="ml-2 inline-block h-3 w-4 align-middle tabular-nums" />
        </SectionLabel>
        <Skeleton className="size-5 shrink-0 rounded-md" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {Array.from({ length: cards }).map((_, cardIndex) => (
          <TaskCardSkeleton key={cardIndex} showFooter={cardIndex % 2 === 0} />
        ))}
      </div>
    </div>
  );
}

export function BoardSkeletonLayout({
  columns = BOARD_SKELETON_COLUMN_COUNT,
  cardsPerColumn = BOARD_SKELETON_CARDS_PER_COLUMN,
}: {
  columns?: number;
  cardsPerColumn?: number;
}) {
  return (
    <div className="divide-border flex h-full min-h-0 w-full flex-1 divide-x overflow-x-auto">
      {Array.from({ length: columns }).map((_, colIndex) => (
        <TaskBoardColumnSkeleton key={colIndex} cards={cardsPerColumn} />
      ))}
    </div>
  );
}
