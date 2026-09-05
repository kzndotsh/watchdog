import { z } from "zod";

import {
  acceptProposalEffect,
  createAgentProposalEffect,
  listProposalsForCaseEffect,
  rejectProposalEffect,
} from "@watchdog/core";
import { patchOpSchema } from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import {
  confidenceTierSchema,
  proposalSchema,
  proposalStatusSchema,
} from "../schemas";

export const create = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/proposals",
    summary: "Create an agent Proposal (Inbox)",
    tags: ["inbox"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      patch: z.array(patchOpSchema).min(1),
      summary: z.string().optional(),
      evidenceIds: z.array(z.uuid()).optional(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      status: proposalStatusSchema.optional(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      proposalId: z.uuid(),
      confidence: confidenceTierSchema.optional(),
      sharedEvidenceIds: z.array(z.uuid()).optional().default([]),
      attestationText: z.string().optional(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      proposalId: z.uuid(),
      reason: z.string().optional(),
    })
  )
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
