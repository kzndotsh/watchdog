import { orpc } from "@/lib/orpc-client";

/**
 * Collect keys are the oRPC procedure keys: `all(caseId)` is `[["collect"], { input: { caseId } }]`,
 * every view and by-id read of the Case's queue (Job and Evidence changes refresh them).
 */
export const collectKeys = {
  all: (caseId: string) => orpc.collect.key({ input: { caseId } }),
  item: (caseId: string, id: string, isHidden: boolean) =>
    orpc.collect.get.key({
      type: "query",
      input: { caseId, id, ...(isHidden ? { hidden: true as const } : {}) },
    }),
};
