import {
  getGraphEgoEffect,
  getGraphSnapshotEffect,
} from "@watchdog/core/graph";
import {
  listGraphWritesForCaseEffect,
  writeGraphFromAgentEffect,
} from "@watchdog/core/proposals";
import {
  caseScopeInputSchema,
  entityScopeInputSchema,
  GRAPH_EGO_EDGE_MAX,
  GRAPH_SNAPSHOT_EDGE_MAX,
  GRAPH_SNAPSHOT_ENTITY_MAX,
  graphWriteInputSchema,
  graphWriteList,
} from "@watchdog/schemas/graph";

import { actorLabelFromContext, graphActorFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import {
  graphEgoSchema,
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

export const ego = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/graph",
    summary: `One entity's neighbourhood, capped: at most ${GRAPH_EGO_EDGE_MAX} of its connections (either end, most recently updated first), each with the other end's label. isTruncated is true when it has more`,
    tags: ["graph"],
  })
  .input(entityScopeInputSchema)
  .output(graphEgoSchema)
  .handler(async ({ input, context }) =>
    runApp(
      getGraphEgoEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId
      )
    )
  );

export const listWrites = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/graph/writes",
    summary:
      "List Graph write audit rows for a case: filters, search and sort, a page at a time, newest first",
    tags: ["graph"],
  })
  .input(graphWriteList.input)
  .output(graphWritePageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listGraphWritesForCaseEffect(
        input.caseId,
        context.actor.organizationId,
        input
      )
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
