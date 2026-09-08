/**
 * Resolve queue selection when URL is SoT: keep `urlId` if it appears in the
 * visible rows, otherwise fall back to the first row (or null if empty).
 *
 * `holdMissingUrlId`: keep a URL id that is not in `rows` yet (e.g. just-created
 * job while the list is still refetching) so callers do not Navigate-clobber
 * the URL and remount the split view.
 */
export function resolveQueueSelection(
  urlId: string | undefined,
  rows: readonly { id: string }[],
  opts?: { holdMissingUrlId?: boolean }
): string | null {
  const normalizedUrlId =
    urlId === undefined
      ? undefined
      : (() => {
          const trimmed = urlId.trim();
          return trimmed === "" ? undefined : trimmed;
        })();
  if (normalizedUrlId !== undefined) {
    if (rows.some((r) => r.id === normalizedUrlId)) return normalizedUrlId;
    if (opts?.holdMissingUrlId) return normalizedUrlId;
  }
  return rows[0]?.id ?? null;
}
