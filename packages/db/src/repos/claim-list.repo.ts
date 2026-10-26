import { eq, inArray } from "drizzle-orm";

import { claimList } from "@watchdog/schemas/graph";

import { claims } from "../schema/claims";
import { defineListRepo } from "./_list-query";
import { claimColumns } from "./claims.repo";

/**
 * The Case's Claim list (`claimList`, ADR-0007): one per Case. An Entity's Claims are this list
 * with `entityId` fixed (the Dossier tab), served by `claims_entity_created_idx`. Retracted
 * Claims are the `retracted` view only.
 */
export const claimListRepo = defineListRepo(claimList, {
  table: claims,
  base: (exec, listKey) =>
    exec
      .select({ ...claimColumns, listKey })
      .from(claims)
      .$dynamic(),
  id: claims.id,
  scopeColumn: claims.caseId,
  scope: ({ caseId }) => eq(claims.caseId, caseId),
  filters: {
    retracted: (isRetracted) => eq(claims.retracted, isRetracted),
    class: (classes) =>
      classes.length > 0 ? inArray(claims.class, [...classes]) : undefined,
    confidence: (tiers) =>
      tiers.length > 0 ? inArray(claims.confidence, [...tiers]) : undefined,
    entityId: (id) => (id === null ? undefined : eq(claims.entityId, id)),
  },
  // `claims_entity_created_idx (entity_id, created_at, id)`
  selective: { entityId: claims.entityId },
  sorts: { added: claims.createdAt },
  searchLabels: { class: claims.class, confidence: claims.confidence },
  search: { text: claims.text },
});

/** A row of the Claim list: the Claim and its cursor value. */
export type ClaimListRow = Awaited<
  ReturnType<typeof claimListRepo.page>
>[number];
