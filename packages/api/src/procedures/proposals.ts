import {
  acceptProposalEffect,
  createAgentProposalEffect,
  getProposalEffect,
  listProposalsForCaseEffect,
  rejectProposalEffect,
} from "@watchdog/core/proposals";
import {
  acceptProposalInputSchema,
  createProposalInputSchema,
  getProposalInputSchema,
  proposalList,
  rejectProposalInputSchema,
} from "@watchdog/schemas/jobs";

import { authed, sessionAuthed } from "../os";
import { runApp } from "../runtime";
import { proposalSchema, proposalListPageSchema } from "../schemas";

export const create = authed
  .meta({ scope: "proposals:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/proposals",
    summary: "Create an agent Proposal (Inbox)",
    tags: ["inbox"],
    successStatus: 201,
  })
  .input(createProposalInputSchema)
  .output(proposalSchema)
  .handler(async ({ input, context }) => {
    const { proposal } = await runApp(
      createAgentProposalEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        patch: input.patch,
        summary: input.summary,
        evidenceIds: input.evidenceIds,
      })
    );
    return proposal;
  });

/**
 * The Case's Proposal list (`proposalList`, ADR-0007): the `status` filter, `q` and sort, a page
 * at a time with `total` on the first page. No `status` is every status.
 */
export const listForCase = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/proposals",
    summary: "List proposals for a case",
    tags: ["inbox"],
  })
  .input(proposalList.input)
  .output(proposalListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listProposalsForCaseEffect(
        input.caseId,
        context.actor.organizationId,
        input
      )
    )
  );

/** One Proposal of the Case, whatever its status; `not_found` when the Case has no such Proposal. */
export const get = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/proposals/{proposalId}",
    summary: "Get a proposal",
    tags: ["inbox"],
  })
  .input(getProposalInputSchema)
  .output(proposalSchema)
  .handler(async ({ input, context }) =>
    runApp(
      getProposalEffect(
        input.caseId,
        context.actor.organizationId,
        input.proposalId
      )
    )
  );

export const accept = sessionAuthed
  .route({
    method: "POST",
    path: "/cases/{caseId}/proposals/{proposalId}/accept",
    summary: "Accept a pending Proposal",
    tags: ["inbox"],
  })
  .input(acceptProposalInputSchema)
  .output(proposalSchema)
  .handler(async ({ input, context }) =>
    runApp(
      acceptProposalEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        proposalId: input.proposalId,
        confidence: input.confidence,
        sharedEvidenceIds: input.sharedEvidenceIds,
        attestationText: input.attestationText,
        actorId: context.actor.userId,
      })
    )
  );

export const reject = sessionAuthed
  .route({
    method: "POST",
    path: "/cases/{caseId}/proposals/{proposalId}/reject",
    summary: "Reject a pending Proposal",
    tags: ["inbox"],
  })
  .input(rejectProposalInputSchema)
  .output(proposalSchema)
  .handler(async ({ input, context }) =>
    runApp(
      rejectProposalEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        proposalId: input.proposalId,
        reason: input.reason,
        actorId: context.actor.userId,
      })
    )
  );
