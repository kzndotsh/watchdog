import { z } from "zod";

import { proposalList } from "@watchdog/schemas/jobs";
import {
  optionalUuidSchema,
  type ListSearch,
  type UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

/**
 * The Triage route's search (ADR-0007): the Proposal list's view (`status`, `q`, `sort`) plus the
 * selected Proposal. A bad `proposalId` is dropped, never an error page.
 */
export const triageSearchSchema = proposalList.searchWith({
  proposalId: z.preprocess(
    (value) => optionalUuidSchema.safeParse(value).data,
    z.string().optional()
  ),
});

export type TriageSearch = ListSearch<typeof proposalList> & {
  readonly proposalId?: string | undefined;
};

export type TriageSearchPatch = UnfixedSearchPatch<
  typeof proposalList,
  never
> & {
  readonly proposalId?: string | undefined;
};
