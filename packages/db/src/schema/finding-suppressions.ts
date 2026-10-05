import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { CaseId } from "@watchdog/schemas/shared";

import { createdAt } from "./_helpers";
import { cases } from "./cases";
import { proposals } from "./proposals";

/**
 * False-positive / known-finding memory.
 * Rejected Proposal ops land here so Cap re-runs do not re-propose them.
 */
export const findingSuppressions = pgTable(
  "finding_suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    /** Why suppressed — currently only rejected Proposals. */
    reason: text("reason").notNull().default("rejected"),
    proposalId: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "set null",
    }),
    createdAt,
  },
  (t) => [
    uniqueIndex("finding_suppressions_case_fp_uidx").on(
      t.caseId,
      t.fingerprint
    ),
  ]
);
