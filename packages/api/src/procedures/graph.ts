import { z } from "zod";

import {
  listGraphWritesForCaseEffect,
  writeGraphFromAgentEffect,
} from "@watchdog/core";
import { caseScopeInputSchema, graphWriteInputSchema } from "@watchdog/schemas";

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
  .input(caseScopeInputSchema)
  .output(z.array(graphWriteRecordSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listGraphWritesForCaseEffect(input.caseId, context.actor.organizationId)
    )
  );

export const write = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/graph/write",
    summary: "Write Graph from agent (userOverride escape hatch)",
    tags: ["graph"],
    successStatus: 201,
  })
  .input(graphWriteInputSchema)
  .output(graphWriteResultSchema)
  .handler(async ({ input, context }) =>
    runApp(
      writeGraphFromAgentEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
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
