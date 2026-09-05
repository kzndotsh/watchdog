import { z } from "zod";

import {
  listGraphWritesForCaseEffect,
  writeGraphFromAgentEffect,
} from "@watchdog/core";
import { patchOpSchema } from "@watchdog/schemas";

import { actorLabelFromActor } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import { graphWriteRecordSchema, graphWriteResultSchema } from "../schemas";

export const listWrites = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/graph/writes",
    summary: "List Graph write audit rows for a case",
    tags: ["graph"],
  })
  .input(z.object({ caseId: z.uuid() }))
  .output(z.array(graphWriteRecordSchema))
  .handler(async ({ input }) =>
    runApp(listGraphWritesForCaseEffect(input.caseId))
  );

export const write = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/graph/write",
    summary: "Write Graph from agent (userOverride escape hatch)",
    tags: ["graph"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      patch: z.array(patchOpSchema).min(1),
      summary: z.string().optional(),
      evidenceIds: z.array(z.uuid()).optional(),
      userOverride: z.literal(true),
      idempotencyKey: z.string().min(1).optional(),
    })
  )
  .output(graphWriteResultSchema)
  .handler(async ({ input, context }) =>
    runApp(
      writeGraphFromAgentEffect({
        caseId: input.caseId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromActor(context.actor),
        patch: input.patch,
        summary: input.summary,
        evidenceIds: input.evidenceIds,
        userOverride: true,
        idempotencyKey: input.idempotencyKey,
      })
    )
  );
