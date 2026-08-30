import { createServerFn } from "@tanstack/react-start";

import {
  acceptProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
} from "@/domains/triage/types";
import { orpcFromContext } from "@/lib/orpc.server";
import type { ProposalRecord } from "@watchdog/core";

export { type ProposalRecord } from "@watchdog/core";

export const listProposalsFn = createServerFn({ method: "GET" })
  .validator(listProposalsInputSchema)
  .handler(
    async ({ data, context }): Promise<ProposalRecord[]> =>
      orpcFromContext(context).proposals.listForCase({
        caseId: data.caseId,
        ...(data.status === undefined ? {} : { status: data.status }),
      })
  );

export const acceptProposalFn = createServerFn({ method: "POST" })
  .validator(acceptProposalInputSchema)
  .handler(
    async ({ data, context }): Promise<ProposalRecord> =>
      orpcFromContext(context).proposals.accept(data)
  );

export const rejectProposalFn = createServerFn({ method: "POST" })
  .validator(rejectProposalInputSchema)
  .handler(
    async ({ data, context }): Promise<ProposalRecord> =>
      orpcFromContext(context).proposals.reject(data)
  );
