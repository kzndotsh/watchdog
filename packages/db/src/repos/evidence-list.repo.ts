import { eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { evidenceList } from "@watchdog/schemas/evidence";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { evidence } from "../schema/evidence";
import { defineListRepo } from "./_list-query";
import type {
  ListBinding,
  ListKeySql,
  ListRow,
  ListSelect,
} from "./_list-query";
import { evidenceColumns } from "./evidence.repo";

/**
 * The Evidence list's binding, minus its select: the filters, sorts and search are written once,
 * and each repo adds the columns it reads (`base`). The full list selects the record; the picker
 * selects its slim projection (#566) over the same WHERE, ORDER BY and indexes.
 */
function evidenceListBinding<Row extends ListRow>(
  base: (exec: DbExec, listKey: ListKeySql) => ListSelect<Row>
): ListBinding<typeof evidenceList, typeof evidence, Row> {
  return {
    table: evidence,
    base,
    id: evidence.id,
    scopeColumn: evidence.caseId,
    scope: ({ caseId }) => eq(evidence.caseId, caseId),
    filters: {
      hidden: (isHidden) =>
        isHidden ? isNotNull(evidence.deletedAt) : isNull(evidence.deletedAt),
      unprocessed: (isOn) => (isOn ? isNull(evidence.processedAt) : undefined),
      unattached: (isOn) => (isOn ? isNull(evidence.entityId) : undefined),
      kind: (kinds) =>
        kinds.length > 0 ? inArray(evidence.kind, [...kinds]) : undefined,
      entityId: (id) => (id === null ? undefined : eq(evidence.entityId, id)),
    },
    // `evidence_entity_captured_idx (entity_id, captured_at desc, id desc)`
    selective: { entityId: evidence.entityId },
    sorts: {
      captured: evidence.capturedAt,
      // nullable: sorted as coalesce(label, '') through `evidence_case_label_idx`
      label: { column: evidence.label, nullsAs: "" },
    },
    searchLabels: { kind: evidence.kind },
    search: {
      label: evidence.label,
      notes: evidence.notes,
      sourceUrl: evidence.sourceUrl,
    },
  };
}

/**
 * The Case's Evidence list (`evidenceList`, ADR-0007). Builder API only: leaving out a declared
 * filter, sort or search field, or binding a column of the wrong type, does not compile. Hidden
 * (soft-deleted) rows are the `hidden` view, never mixed with the others.
 */
export const evidenceListRepo = defineListRepo(
  evidenceList,
  evidenceListBinding((exec, listKey) =>
    exec
      .select({ ...evidenceColumns, entityName: entities.name, listKey })
      .from(evidence)
      .leftJoin(entities, eq(evidence.entityId, entities.id))
      .$dynamic()
  )
);

/**
 * The same list for the Evidence pickers (#566): the picker's columns only (no body, notes, uri
 * or actor, and no Entity join), so a page stays small however long the captured text is.
 */
export const evidencePickerListRepo = defineListRepo(
  evidenceList,
  evidenceListBinding((exec, listKey) =>
    exec
      .select({
        id: evidence.id,
        kind: evidence.kind,
        label: evidence.label,
        sourceUrl: evidence.sourceUrl,
        sha256: evidence.sha256,
        capturedAt: evidence.capturedAt,
        listKey,
      })
      .from(evidence)
      .$dynamic()
  )
);

/** A row of the Evidence list: the Evidence, its attached Entity's name, and its cursor value. */
export type EvidenceListRow = Awaited<
  ReturnType<typeof evidenceListRepo.page>
>[number];

/** A row of the Evidence picker's page. */
export type EvidencePickerListRow = Awaited<
  ReturnType<typeof evidencePickerListRepo.page>
>[number];
