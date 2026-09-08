import { z } from "zod";

import {
  acceptProposalEffect,
  createAgentProposalEffect,
  listProposalsForCaseEffect,
  rejectProposalEffect,
} from "@watchdog/core";
import {
  acceptProposalInputSchema,
  createProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
} from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import { proposalSchema } from "../schemas";

export const create = authed
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

export const listForCase = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/proposals",
    summary: "List proposals for a case",
    tags: ["inbox"],
  })
  .input(listProposalsInputSchema)
  .output(z.array(proposalSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listProposalsForCaseEffect(
        input.caseId,
        context.actor.organizationId,
        input.status === undefined ? undefined : { status: input.status }
      )
    )
  );

export const accept = authed
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

export const reject = authed
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
