import { getGraphSnapshotEffect } from "@watchdog/core/graph";
import {
  listGraphWritesForCaseEffect,
  writeGraphFromAgentEffect,
} from "@watchdog/core/proposals";
import {
  caseScopeInputSchema,
  GRAPH_SNAPSHOT_EDGE_MAX,
  GRAPH_SNAPSHOT_ENTITY_MAX,
  graphWriteInputSchema,
  listCaseChildrenInputSchema,
} from "@watchdog/schemas/graph";

import { actorLabelFromContext, graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import {
  graphSnapshotSchema,
  graphWriteResultSchema,
  graphWritePageSchema,
} from "../schemas";

export const snapshot = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/graph/snapshot",
    summary: `The Case graph, capped: the ${GRAPH_SNAPSHOT_ENTITY_MAX} most connected entities (by connection count, then most recently updated) and at most ${GRAPH_SNAPSHOT_EDGE_MAX} connections between them (most recently updated first). isTruncated is true when either cap left something out`,
    tags: ["graph"],
  })
  .input(caseScopeInputSchema)
  .output(graphSnapshotSchema)
  .handler(async ({ input, context }) =>
    runApp(getGraphSnapshotEffect(input.caseId, context.actor.organizationId))
  );

export const listWrites = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/graph/writes",
    summary: "List Graph write audit rows for a case",
    tags: ["graph"],
  })
  .input(listCaseChildrenInputSchema)
  .output(graphWritePageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listGraphWritesForCaseEffect(input.caseId, context.actor.organizationId, {
        cursor: input.cursor,
        limit: input.limit,
      })
    )
  );

export const write = authed
  .meta({ scope: "graph:write" })
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
        actorLabel: actorLabelFromContext(context),
        actorKeyId: graphActorFromContext(context).actorKeyId,
        patch: input.patch,
        summary: input.summary,
        evidenceIds: input.evidenceIds,
        userOverride: true,
        idempotencyKey: input.idempotencyKey,
      })
    )
  );
