import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { graphHistory, type DbExec } from "@watchdog/db";
import type { CaseId, GraphHistoryKind } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import type { ListConformance } from "./types.ts";

/* Past any identity value the test database has handed out; ids rise with `n`. */
const ID_BASE = 920_000;
const ROW_ID = testId(1700);
const OTHER_ROW_ID = testId(1701);
const KIND: GraphHistoryKind = "claim";
/** The row's entries: the newest is the largest `n`. */
const COUNT = 8;

const tagOf = (n: number) => `h${String(n).padStart(2, "0")}`;

function entry(
  n: number,
  where: {
    readonly caseId: CaseId;
    readonly kind: GraphHistoryKind;
    readonly rowId: string;
  }
) {
  return {
    id: ID_BASE + n,
    ...where,
    op: "update" as const,
    channel: "dossier" as const,
    before: { text: `v${n - 1}` },
    after: { text: `v${n}` },
  };
}

/**
 * The history table is written by triggers and the application role has no INSERT, so the
 * fixture writes it as the table owner (`DATABASE_URL_MIGRATE`, which the harness points at the
 * same database), with explicit ids.
 */
async function insertAsOwner(rows: readonly ReturnType<typeof entry>[]) {
  const owner = postgres(process.env.DATABASE_URL_MIGRATE ?? "", {
    max: 1,
    idle_timeout: 5,
  });
  try {
    await drizzle(owner)
      .insert(graphHistory)
      .overridingSystemValue()
      .values([...rows]);
  } finally {
    await owner.end({ timeout: 5 });
  }
}

export const graphHistoryConformance: ListConformance = {
  list: "graph-history",
  pageLimit: 3,
  rows: Array.from({ length: COUNT }, (_, index) => ({
    tag: tagOf(index + 1),
    id: String(ID_BASE + index + 1),
    facts: {},
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "History conformance" });
    const other = await seedCase(exec, { name: "History conformance decoy" });
    const here = { caseId: owner.id, kind: KIND, rowId: ROW_ID };
    await insertAsOwner([
      ...Array.from({ length: COUNT }, (_, index) => entry(index + 1, here)),
      // Decoys that sort first and last: another row, another kind and another Case, each with
      // the scope's other two parts, so no one of the three equalities can be dropped.
      entry(20, { ...here, rowId: OTHER_ROW_ID }),
      entry(21, { ...here, kind: "entity" }),
      entry(22, { ...here, caseId: other.id }),
      entry(0, { ...here, caseId: other.id }),
    ]);
    return {
      scope: { caseId: owner.id, kind: KIND, rowId: ROW_ID },
      otherScope: { caseId: other.id, kind: KIND, rowId: ROW_ID },
      wire: { caseId: owner.id, kind: KIND, rowId: ROW_ID },
    };
  },
  orders: {
    "change.desc": ["h08", "h07", "h06", "h05", "h04", "h03", "h02", "h01"],
    "change.asc": ["h01", "h02", "h03", "h04", "h05", "h06", "h07", "h08"],
  },
  reference: {},
  samples: {},
  searches: [],
};
