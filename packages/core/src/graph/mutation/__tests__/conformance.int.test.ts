import {
  claimsRepo,
  db,
  eventsRepo,
  evidenceLinksRepo,
  type ClaimPatch,
  type ClaimRow,
  type EventRow,
  type NewClaim,
} from "@watchdog/db";
import { seedEvidence } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import {
  seedGraphFixture,
  type GraphFixture,
} from "../../__tests__/graph-mutations";
import {
  claimsTable,
  eventsTable,
  retractClaim,
  type ClaimRecord,
  type EventRecord,
} from "../tables";
import { defineConformance } from "./conformance-suite";

/** One `defineConformance` call per `GraphTable`; the suite itself is in `conformance-suite.ts`. */

defineConformance<
  EventRow,
  EventRecord,
  Parameters<typeof eventsTable.repo.insert>[2],
  Parameters<typeof eventsTable.repo.update>[3],
  GraphFixture
>({
  name: "events",
  table: eventsTable,
  historyKind: "event",
  seed: () => seedGraphFixture(),
  rowOf: async (fx, id) => {
    const row = await eventsRepo.getInCase(db, fx.caseId, id ?? fx.eventId);
    if (row === null) throw new Error("seeded event missing");
    return row;
  },
  countRows: async (fx) =>
    (await eventsRepo.listForEntity(db, fx.entityId)).length,
  values: (fx, label) => ({
    entityId: fx.entityId,
    when: "1840",
    what: label,
    whereText: null,
  }),
  patch: (row, label) => ({
    when: row.when,
    what: label,
    whereText: row.whereText,
  }),
});

defineConformance<
  ClaimRow,
  ClaimRecord,
  Omit<NewClaim, "caseId">,
  ClaimPatch,
  GraphFixture
>({
  name: "claims",
  table: claimsTable,
  historyKind: "claim",
  seed: () => seedGraphFixture(),
  rowOf: async (fx, id) => {
    const row = await claimsRepo.getInCase(db, fx.caseId, id ?? fx.claimId);
    if (row === null) throw new Error("seeded claim missing");
    return row;
  },
  countRows: async (fx) =>
    (await claimsRepo.listForEntity(db, fx.entityId)).length,
  values: (fx, label) => ({
    entityId: fx.entityId,
    text: label,
    confidence: "unverified",
    class: "observation",
  }),
  patch: (_row, label) => ({ text: label }),
  evidence: {
    ids: async (fx) => [
      (await seedEvidence(db, fx.caseId, { label: "First cite" })).id,
      (await seedEvidence(db, fx.caseId, { label: "Second cite" })).id,
    ],
    linked: async (id) =>
      [
        ...((await evidenceLinksRepo.listForClaims(db, [id])).get(id) ?? []),
      ].sort(),
    describe: (rec) => ({ id: rec.id, version: rec.version }),
  },
  transition: {
    run: (w, id) =>
      w.transition(
        claimsTable,
        id,
        retractClaim,
        {
          retractKind: "retracted",
          retractedReason: "conformance",
          retractedBy: TEST_ACTOR_ID,
        },
        { toValue: "retracted" }
      ),
    action: "retracted",
    toValue: "retracted",
  },
});
