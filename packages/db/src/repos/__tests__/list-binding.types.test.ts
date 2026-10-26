/**
 * Type test (ADR-0007, #549): `pnpm typecheck` compiles this file, so every `@ts-expect-error`
 * below fails the build the day the mistake it marks starts to compile (an unused directive is
 * TS2578). The positive cases prove the binding keeps the row types exact. The runtime
 * assertions only keep vitest honest: no binding here is ever run.
 */
import { eq, isNull } from "drizzle-orm";
import { describe, expect, expectTypeOf, it } from "vitest";

import { evidenceList } from "@watchdog/schemas/evidence";
import type { CaseId, EvidenceKind } from "@watchdog/schemas/shared";

import type { DbExec } from "../../exec";
import { entities } from "../../schema/entities";
import { evidence } from "../../schema/evidence";
import { identifiers } from "../../schema/identifiers";
import { defineListRepo } from "../_list-query";
import type { ListKeySql } from "../_list-query";
import type { EvidenceListRow } from "../evidence-list.repo";

const allFilters = {
  hidden: () => undefined,
  unprocessed: () => undefined,
  unattached: () => undefined,
  kind: () => undefined,
  entityId: () => undefined,
} as const;
const evidenceSearch = {
  label: evidence.label,
  notes: evidence.notes,
  sourceUrl: evidence.sourceUrl,
} as const;
const evidenceSorts = {
  captured: evidence.capturedAt,
  label: { column: evidence.label, nullsAs: "" },
} as const;
const evidenceBase = (exec: DbExec, listKey: ListKeySql) =>
  exec.select({ id: evidence.id, listKey }).from(evidence).$dynamic();
const scope = ({ caseId }: { caseId: CaseId }) => eq(evidence.caseId, caseId);
const common = {
  table: evidence,
  base: evidenceBase,
  id: evidence.id,
  scopeColumn: evidence.caseId,
  scope,
} as const;

describe("list binding: rows stay exact", () => {
  it("types a page row from the base select", () => {
    expectTypeOf<EvidenceListRow["label"]>().toEqualTypeOf<string | null>();
    expectTypeOf<EvidenceListRow["kind"]>().toEqualTypeOf<EvidenceKind>();
    expectTypeOf<EvidenceListRow["entityName"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<EvidenceListRow["listKey"]>().toEqualTypeOf<string | number>();
    const repo = defineListRepo(evidenceList, {
      ...common,
      filters: allFilters,
      sorts: evidenceSorts,
      search: evidenceSearch,
    });
    expect(repo.indexNeeds.table).toBe("evidence");
  });
});

/** Binds without running: the mistakes below are for the compiler, and some would throw. */
function compileOnly(bind: () => unknown): void {
  expect(bind).toBeTypeOf("function");
}

describe("list binding: mistakes do not compile", () => {
  it("rejects a binding missing a declared filter", () => {
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        // @ts-expect-error -- `entityId` is declared on evidenceList but has no predicate here
        filters: {
          hidden: (isOn) => (isOn ? undefined : isNull(evidence.deletedAt)),
          unprocessed: () => undefined,
          unattached: () => undefined,
          kind: () => undefined,
        },
        sorts: evidenceSorts,
        search: evidenceSearch,
      })
    );
  });

  it("rejects a sort bound to a column of the wrong type", () => {
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: {
          // @ts-expect-error -- "captured" is declared `time` (Date); evidence.kind is text
          captured: evidence.kind,
          label: { column: evidence.label, nullsAs: "" },
        },
        search: evidenceSearch,
      })
    );
  });

  it("rejects a nullable sort column without a sentinel, and a sentinel of the wrong type", () => {
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: {
          captured: evidence.capturedAt,
          // @ts-expect-error -- evidence.label is nullable: it needs `{ column, nullsAs }`
          label: evidence.label,
        },
        search: evidenceSearch,
      })
    );
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: {
          captured: evidence.capturedAt,
          // @ts-expect-error -- a text sort's sentinel is '' (it sorts first under any collation)
          label: { column: evidence.label, nullsAs: 42 },
        },
        search: evidenceSearch,
      })
    );
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: {
          captured: evidence.capturedAt,
          // @ts-expect-error -- any text sentinel but '' would need COLLATE "C" on the key and index
          label: { column: evidence.label, nullsAs: "~" },
        },
        search: evidenceSearch,
      })
    );
  });

  it("rejects id, scope, sort and search columns from another table", () => {
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        // @ts-expect-error -- `id` must be the table's own `id` column
        id: identifiers.id,
        filters: allFilters,
        sorts: evidenceSorts,
        search: evidenceSearch,
      })
    );
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        // @ts-expect-error -- the scope column belongs to the list's table
        scopeColumn: identifiers.caseId,
        filters: allFilters,
        sorts: evidenceSorts,
        search: evidenceSearch,
      })
    );
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        // @ts-expect-error -- the scope column must be NOT NULL (evidence.label is nullable)
        scopeColumn: evidence.label,
        filters: allFilters,
        sorts: evidenceSorts,
        search: evidenceSearch,
      })
    );
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: {
          captured: evidence.capturedAt,
          // @ts-expect-error -- a joined table's column (entities.name) is not index-ordered
          label: entities.name,
        },
        search: evidenceSearch,
      })
    );
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: evidenceSorts,
        // @ts-expect-error -- search columns belong to the list's table (entities.name is joined)
        search: { ...evidenceSearch, label: entities.name },
      })
    );
  });

  it("rejects display-label search on a filter that is not `choices`", () => {
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        filters: allFilters,
        sorts: evidenceSorts,
        // @ts-expect-error -- `hidden` is a flag: display labels belong to `choices` filters
        searchLabels: { hidden: evidence.kind },
        search: evidenceSearch,
      })
    );
  });

  it("rejects a base select without the cursor value", () => {
    compileOnly(() =>
      defineListRepo(evidenceList, {
        ...common,
        base: (exec) =>
          // @ts-expect-error -- `base` must select `listKey` (the cursor value of the active sort)
          exec.select({ id: evidence.id }).from(evidence).$dynamic(),
        filters: allFilters,
        sorts: evidenceSorts,
        search: evidenceSearch,
      })
    );
  });
});
