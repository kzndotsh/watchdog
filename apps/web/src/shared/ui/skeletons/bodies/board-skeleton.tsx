import { cn } from "@/lib/utils";
import { BoardSkeletonLayout } from "@/shared/ui/skeletons/bodies/board-skeleton-layout";
import {
  BOARD_SKELETON_COLUMN_COUNT,
  BOARD_SKELETON_CARDS_PER_COLUMN,
} from "@/shared/ui/skeletons/constants";

type BoardSkeletonProps = {
  columns?: number;
  cardsPerColumn?: number;
  className?: string;
};

/** Task board columns — toolbar stays mounted; shape matched to TaskBoard. */
export function BoardSkeleton({
  columns = BOARD_SKELETON_COLUMN_COUNT,
  cardsPerColumn = BOARD_SKELETON_CARDS_PER_COLUMN,
  className,
}: BoardSkeletonProps) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <BoardSkeletonLayout columns={columns} cardsPerColumn={cardsPerColumn} />
    </div>
  );
}
