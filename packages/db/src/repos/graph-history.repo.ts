import { and, asc, desc, eq, lt, or } from "drizzle-orm";

import type {
  CaseId,
  GraphHistoryChannel,
  GraphHistoryKind,
  GraphHistoryOp,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { claims } from "../schema/claims";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { events } from "../schema/events";
import { graphHistory } from "../schema/graph-history";
import type { GraphHistorySnapshotJson } from "../schema/graph-history";
import { identifiers } from "../schema/identifiers";
import { questions } from "../schema/questions";
import { tasks } from "../schema/tasks";
import { trimActorId, trimCaseId, trimResourceId } from "./_scoped-ids";
import { evidenceLinksRepo } from "./evidence-links.repo";

export type GraphHistoryRow = typeof graphHistory.$inferSelect;

export type NewGraphHistory = {
  caseId: CaseId;
  kind: GraphHistoryKind;
  rowId: string;
  op: GraphHistoryOp;
  channel: GraphHistoryChannel;
  actorId: string | null;
  actorLabel: string | null;
  before: GraphHistorySnapshotJson | null;
  after: GraphHistorySnapshotJson | null;
};

/** A Graph row that a delete cascades to (or an unlink), captured before the parent goes. */
export type CascadedGraphRow = {
  kind: GraphHistoryKind;
  id: string;
  snapshot: GraphHistorySnapshotJson;
};

export type ListGraphHistoryOpts = {
  caseId: CaseId;
  kind: GraphHistoryKind;
  rowId: string;
  /** Return entries older than this history id (the previous page's last). */
  beforeId?: number;
  limit: number;
};

const first = (rows: GraphHistorySnapshotJson[]) => rows[0] ?? null;

/**
 * Select a whole row (every column, camelCase keys). The snapshot is the row
 * object itself: the jsonb column serializes it, so a Date becomes ISO text.
 * `lock` takes `FOR NO KEY UPDATE` (what an UPDATE takes, so a concurrent
 * writer of the row waits and the snapshot is the state the caller's write
 * replaces). Not `FOR UPDATE`: that would also block the foreign-key checks of
 * rows inserted under this one (a Task, a Claim) and can deadlock with the Case lock.
 */
async function selectRow(
  exec: DbExec,
  kind: GraphHistoryKind,
  id: string,
  lock: boolean
): Promise<GraphHistorySnapshotJson | null> {
  switch (kind) {
    case "entity": {
      const q = exec.select().from(entities).where(eq(entities.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    case "edge": {
      const q = exec.select().from(edges).where(eq(edges.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    case "claim": {
      const q = exec.select().from(claims).where(eq(claims.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    case "identifier": {
      const q = exec.select().from(identifiers).where(eq(identifiers.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    case "event": {
      const q = exec.select().from(events).where(eq(events.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    case "question": {
      const q = exec.select().from(questions).where(eq(questions.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    case "task": {
      const q = exec.select().from(tasks).where(eq(tasks.id, id));
      return first(await (lock ? q.for("no key update") : q).limit(1));
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * The Evidence ids linked to Claims, Identifiers or Edges (sorted), keyed by
 * row id: a snapshot carries them as `evidenceIds` so a change to the
 * evidence set shows in the history. Other kinds have none.
 */
async function evidenceIdsByRow(
  exec: DbExec,
  kind: GraphHistoryKind,
  ids: string[]
): Promise<Map<string, string[]> | null> {
  if (kind === "claim") return evidenceLinksRepo.listForClaims(exec, ids);
  if (kind === "identifier") {
    return evidenceLinksRepo.listForIdentifiers(exec, ids);
  }
  if (kind === "edge") return evidenceLinksRepo.listForEdges(exec, ids);
  return null;
}

async function withEvidenceIds(
  exec: DbExec,
  kind: GraphHistoryKind,
  rows: { id: string }[]
): Promise<CascadedGraphRow[]> {
  const links = await evidenceIdsByRow(
    exec,
    kind,
    rows.map((row) => row.id)
  );
  return rows.map((row) => ({
    kind,
    id: row.id,
    snapshot:
      links === null
        ? { ...row }
        : { ...row, evidenceIds: [...(links.get(row.id) ?? [])].sort() },
  }));
}

export const graphHistoryRepo = {
  /**
   * The row as it is now (every column, plus `evidenceIds` for a Claim,
   * Identifier or Edge), or `null` when it does not exist (or the id is malformed).
   */
  async snapshot(
    exec: DbExec,
    kind: GraphHistoryKind,
    rowId: string,
    opts?: { lock?: boolean }
  ): Promise<GraphHistorySnapshotJson | null> {
    const scopedRowId = trimResourceId(rowId);
    if (scopedRowId === undefined) return null;
    const row = await selectRow(exec, kind, scopedRowId, opts?.lock === true);
    if (row === null) return null;
    const links = await evidenceIdsByRow(exec, kind, [scopedRowId]);
    if (links === null) return row;
    return { ...row, evidenceIds: [...(links.get(scopedRowId) ?? [])].sort() };
  },

  /**
   * Lock and capture every row that deleting an Entity removes (its Claims,
   * Identifiers, Events, Questions and Edges in either direction) or unlinks
   * (its Tasks), so the delete can record one history row each.
   */
  async lockEntityDependents(
    exec: DbExec,
    entityId: string
  ): Promise<{ deleted: CascadedGraphRow[]; unlinked: CascadedGraphRow[] }> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return { deleted: [], unlinked: [] };
    const claimRows = await exec
      .select()
      .from(claims)
      .where(eq(claims.entityId, scopedEntityId))
      .orderBy(asc(claims.id))
      .for("no key update");
    const identifierRows = await exec
      .select()
      .from(identifiers)
      .where(eq(identifiers.entityId, scopedEntityId))
      .orderBy(asc(identifiers.id))
      .for("no key update");
    const eventRows = await exec
      .select()
      .from(events)
      .where(eq(events.entityId, scopedEntityId))
      .orderBy(asc(events.id))
      .for("no key update");
    const questionRows = await exec
      .select()
      .from(questions)
      .where(eq(questions.entityId, scopedEntityId))
      .orderBy(asc(questions.id))
      .for("no key update");
    const edgeRows = await exec
      .select()
      .from(edges)
      .where(
        or(eq(edges.fromId, scopedEntityId), eq(edges.toId, scopedEntityId))
      )
      .orderBy(asc(edges.id))
      .for("no key update");
    const taskRows = await exec
      .select()
      .from(tasks)
      .where(eq(tasks.entityId, scopedEntityId))
      .orderBy(asc(tasks.id))
      .for("no key update");
    return {
      deleted: [
        ...(await withEvidenceIds(exec, "claim", claimRows)),
        ...(await withEvidenceIds(exec, "identifier", identifierRows)),
        ...(await withEvidenceIds(exec, "event", eventRows)),
        ...(await withEvidenceIds(exec, "question", questionRows)),
        ...(await withEvidenceIds(exec, "edge", edgeRows)),
      ],
      unlinked: await withEvidenceIds(exec, "task", taskRows),
    };
  },

  async append(
    exec: DbExec,
    values: NewGraphHistory
  ): Promise<{ id: number } | null> {
    const caseId = trimCaseId(values.caseId);
    const rowId = trimResourceId(values.rowId);
    if (caseId === undefined || rowId === undefined) return null;
    const [created] = await exec
      .insert(graphHistory)
      .values({
        ...values,
        caseId,
        rowId,
        actorId: values.actorId === null ? null : trimActorId(values.actorId),
      })
      .returning({ id: graphHistory.id });
    return created ?? null;
  },

  /** One row's history, newest first, one page: `limit` is the caller's page size plus one. */
  async listForRow(
    exec: DbExec,
    opts: ListGraphHistoryOpts
  ): Promise<GraphHistoryRow[]> {
    const caseId = trimCaseId(opts.caseId);
    const rowId = trimResourceId(opts.rowId);
    if (caseId === undefined || rowId === undefined) return [];
    return exec
      .select()
      .from(graphHistory)
      .where(
        and(
          eq(graphHistory.caseId, caseId),
          eq(graphHistory.kind, opts.kind),
          eq(graphHistory.rowId, rowId),
          opts.beforeId === undefined
            ? undefined
            : lt(graphHistory.id, opts.beforeId)
        )
      )
      .orderBy(desc(graphHistory.id))
      .limit(opts.limit);
  },
};
