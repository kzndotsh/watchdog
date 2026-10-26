import { SectionLabel } from "@/shared/ui/section-label";
import { TaskCardSkeleton } from "@/shared/ui/skeletons/bodies/task-card-skeleton";
import {
  BOARD_SKELETON_COLUMN_COUNT,
  BOARD_SKELETON_CARDS_PER_COLUMN,
} from "@/shared/ui/skeletons/constants";
import { TASK_BOARD_COLUMN_SHELL_CLASS } from "@/shared/ui/task-board-shell";
import { Skeleton } from "@watchdog/ui/components/skeleton";

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
          <TaskCardSkeleton
            key={cardIndex}
            shouldShowFooter={cardIndex % 2 === 0}
          />
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
