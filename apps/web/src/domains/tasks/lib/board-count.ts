import type { TaskBoardRecord } from "@/domains/tasks/types";
import type { ListCountValue } from "@/shared/lib/list/list-types";

/**
 * The board's open-card count in a list's count shape, for `<ListCount variant="compact" />`:
 * the cards it holds, "500+" once `tasks.board` cut the set at `TASK_BOARD_MAX`. Nothing while
 * the board is loading (an empty count hides the pill, as 0 does).
 */
export function taskBoardCount(
  board: TaskBoardRecord | undefined
): ListCountValue {
  const loaded = board?.items.length ?? 0;
  return {
    loaded,
    total:
      board === undefined
        ? null
        : { count: loaded, isCapped: board.isTruncated },
    hasMore: false,
    isAtCeiling: false,
    isSettled: board !== undefined,
  };
}
