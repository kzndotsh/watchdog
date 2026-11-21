/**
 * A column's new order after a drag (`tasks.reorder`). The caller sends the order of the cards it
 * shows, which may be part of the column (the board filtered by Entity or search, or cut at
 * `TASK_BOARD_MAX`): those Tasks take the slots they hold now, in the order sent, and every other
 * Task of the column keeps its slot. Sending the whole column is the plain case.
 *
 * Null when an id is not in the column or is sent twice: the caller's view is stale (a Task moved
 * out of the column under it), and the reorder is refused rather than guessed.
 */
export function mergeColumnOrder(
  column: readonly string[],
  orderedIds: readonly string[]
): string[] | null {
  const sent = new Set(orderedIds);
  if (sent.size !== orderedIds.length) return null;
  const inColumn = new Set(column);
  if (orderedIds.some((id) => !inColumn.has(id))) return null;
  const queue = [...orderedIds];
  return column.map((id) => (sent.has(id) ? (queue.shift() ?? id) : id));
}
