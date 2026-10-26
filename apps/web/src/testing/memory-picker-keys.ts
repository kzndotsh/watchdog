/** Query keys of `memoryPickerPort` (tests only): one page by `q`, and rows by id. */
export const memoryPickerKeys = {
  search: (q: string | null) => ["picker", "search", q ?? ""] as const,
  byIds: (ids: readonly string[]) => ["picker", "by-ids", ...ids] as const,
};
