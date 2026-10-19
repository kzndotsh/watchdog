import { createServerFn } from "@tanstack/react-start";

import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import type { ProposalRecord } from "@watchdog/core/proposals";
import {
  acceptProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
} from "@watchdog/schemas/jobs";
import type { Page } from "@watchdog/schemas/shared";

export const listProposalsFn = createServerFn({ method: "GET" })
  .validator(listProposalsInputSchema)
  .handler(async ({ data, context }): Promise<ProposalRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).proposals.listForCase({
        caseId: data.caseId,
        ...(data.status === undefined ? {} : { status: data.status }),
        ...page,
      })
    )
  );

/** One page of the Case's Proposals, newest first (the Triage queue reads these a page at a time). */
export const listProposalsPageFn = createServerFn({ method: "GET" })
  .validator(listProposalsInputSchema)
  .handler(async ({ data, context }): Promise<Page<ProposalRecord>> =>
    orpcFromContext(context).proposals.listForCase(data)
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
