import { Effect } from "effect";

import {
  GRAPH_EGO_EDGE_MAX,
  GRAPH_SNAPSHOT_EDGE_MAX,
  GRAPH_SNAPSHOT_ENTITY_MAX,
} from "@watchdog/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  EdgePredicate,
  EntityKind,
  OrganizationId,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { graphSnapshotRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
} from "./patch/guards";

export type GraphSnapshotEntity = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly kind: EntityKind;
};

export type GraphSnapshotEdge = {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly predicate: EdgePredicate;
  readonly confidence: ConfidenceTier;
};

/** What the Graph page draws: a capped part of the Case, and whether anything was left out. */
export type GraphSnapshot = {
  readonly entities: GraphSnapshotEntity[];
  readonly edges: GraphSnapshotEdge[];
  readonly isTruncated: boolean;
};

/** The caps; tests pass small ones. */
export type GraphSnapshotCaps = {
  readonly entityMax: number;
  readonly edgeMax: number;
};

const DEFAULT_CAPS: GraphSnapshotCaps = {
  entityMax: GRAPH_SNAPSHOT_ENTITY_MAX,
  edgeMax: GRAPH_SNAPSHOT_EDGE_MAX,
};

/**
 * The Case graph, capped on the server (#570). Keeps the `entityMax` most connected Entities
 * (Connection count in both directions, then most recently updated, then id), then the
 * Connections whose two ends are both kept, most recently updated first, at most `edgeMax`.
 * `isTruncated` is true when either cap cut something. Two statements, each bounded by its cap.
 */
export function getGraphSnapshotEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  caps: GraphSnapshotCaps = DEFAULT_CAPS
): Effect.Effect<GraphSnapshot, DomainTag, Db> {
  return Effect.gen(function* getGraphSnapshotGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const entityRows = yield* graphSnapshotRepoFxDb.mostConnectedEntities(
      scopedCaseId,
      caps.entityMax + 1
    );
    const entities = entityRows.slice(0, caps.entityMax);
    const edgeRows = yield* graphSnapshotRepoFxDb.edgesAmong(
      scopedCaseId,
      entities.map((entity) => entity.id),
      caps.edgeMax + 1
    );
    return {
      entities,
      edges: edgeRows.slice(0, caps.edgeMax),
      isTruncated:
        entityRows.length > caps.entityMax || edgeRows.length > caps.edgeMax,
    };
  });
}

/** One of the Entity's Connections in the ego graph, with the label of its other end. */
export type GraphEgoEdge = GraphSnapshotEdge & {
  readonly peer: GraphSnapshotEntity;
};

/** What the Dossier ego graph draws: a capped star around one Entity. */
export type GraphEgo = {
  readonly edges: GraphEgoEdge[];
  readonly isTruncated: boolean;
};

/**
 * One Entity's neighbourhood, capped on the server (#585): its Connections at either end, most
 * recently updated first, at most `edgeMax`, each with its peer's label. `isTruncated` is true
 * when the Entity has more; the Dossier then says so and its Connections list pages the rest.
 * One statement bounded by the cap, after the Case and Entity checks.
 */
export function getGraphEgoEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  edgeMax: number = GRAPH_EGO_EDGE_MAX
): Effect.Effect<GraphEgo, DomainTag, Db> {
  return Effect.gen(function* getGraphEgoGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const centerId = yield* assertEntityInCaseEffect(scopedCaseId, entityId);
    const rows = yield* graphSnapshotRepoFxDb.egoEdges(
      scopedCaseId,
      centerId,
      edgeMax + 1
    );
    return {
      edges: rows.slice(0, edgeMax),
      isTruncated: rows.length > edgeMax,
    };
  });
}
