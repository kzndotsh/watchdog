export function collectQueueCountLabel(
  queuePending: boolean,
  visibleCount: number,
  totalCount: number
): string | undefined {
  if (queuePending) return undefined;
  if (visibleCount === totalCount) return String(totalCount);
  return `${visibleCount} / ${totalCount}`;
}
