import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";
import type { ProposalRecord } from "@watchdog/core/proposals";
import {
  acceptProposalInputSchema,
  getProposalInputSchema,
  proposalList,
  rejectProposalInputSchema,
} from "@watchdog/schemas/jobs";
import type { ListPage } from "@watchdog/schemas/shared";

/** One page of the Case's Proposal list (`proposalList`, ADR-0007): the Triage queue's view. */
export const listProposalsPageFn = createServerFn({ method: "GET" })
  .validator(proposalList.input)
  .handler(async ({ data, context }): Promise<ListPage<ProposalRecord>> =>
    orpcFromContext(context).proposals.listForCase(data)
  );

/** One Proposal by id (a URL selection the queue has not loaded); null when the Case has none. */
export const getProposalFn = createServerFn({ method: "GET" })
  .validator(getProposalInputSchema)
  .handler(async ({ data, context }): Promise<ProposalRecord | null> =>
    orpcNullIfNotFound(
      orpcFromContext(context).proposals.get({
        caseId: data.caseId,
        proposalId: data.proposalId,
      })
    )
  );

export const acceptProposalFn = createServerFn({ method: "POST" })
  .validator(acceptProposalInputSchema)
  .handler(async ({ data, context }): Promise<ProposalRecord> =>
    orpcFromContext(context).proposals.accept(data)
  );

export const rejectProposalFn = createServerFn({ method: "POST" })
  .validator(rejectProposalInputSchema)
  .handler(async ({ data, context }): Promise<ProposalRecord> =>
    orpcFromContext(context).proposals.reject(data)
  );
