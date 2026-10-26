export const collectKeys = {
  /** Every view and by-id read of the Case's queue: Job and Evidence changes refresh them. */
  all: (caseId: string) => ["collect", caseId] as const,
  item: (caseId: string, id: string, isHidden: boolean) =>
    ["collect", caseId, "item", id, isHidden ? "hidden" : "live"] as const,
};
