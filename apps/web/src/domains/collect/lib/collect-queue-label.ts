export function collectQueueCountLabel(
  isQueuePending: boolean,
  visibleCount: number,
  totalCount: number
): string | undefined {
  if (isQueuePending) return undefined;
  if (visibleCount === totalCount) return String(totalCount);
  return `${visibleCount} / ${totalCount}`;
}
