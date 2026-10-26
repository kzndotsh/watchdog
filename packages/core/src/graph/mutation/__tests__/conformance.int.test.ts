import {
  claimsRepo,
  db,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  evidenceLinksRepo,
  identifiersRepo,
  questionsRepo,
  type ClaimPatch,
  type ClaimRow,
  type EdgePatch,
  type EdgeRow,
  type EntityPatch,
  type EntityRow,
  type EventRow,
  type IdentifierPatch,
  type IdentifierRow,
  type NewClaim,
  type NewEdge,
  type NewIdentifier,
  type NewEntity,
  type NewQuestion,
  type QuestionPatch,
  type QuestionRow,
} from "@watchdog/db";
import type { EdgePredicate } from "@watchdog/schemas/shared";
import { slugifyName } from "@watchdog/schemas/shared";
import { seedEntity, seedEvidence } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

import {
  seedGraphFixture,
  type GraphFixture,
} from "../../__tests__/graph-mutations";
import {
  claimsTable,
  edgesTable,
  entitiesTable,
  eventsTable,
  identifiersTable,
  questionsTable,
  resolveQuestion,
  retractClaim,
  type ClaimRecord,
  type EdgeWritten,
  type EntityRecord,
  type EventRecord,
  type IdentifierRecord,
  type QuestionRecord,
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

defineConformance<
  IdentifierRow,
  IdentifierRecord,
  Omit<NewIdentifier, "caseId">,
  IdentifierPatch,
  GraphFixture
>({
  name: "identifiers",
  table: identifiersTable,
  historyKind: "identifier",
  seed: () => seedGraphFixture(),
  rowOf: async (fx, id) => {
    const row = await identifiersRepo.getInCase(
      db,
      fx.caseId,
      id ?? fx.identifierId
    );
    if (row === null) throw new Error("seeded identifier missing");
    return row;
  },
  countRows: async (fx) =>
    (await identifiersRepo.listForEntity(db, fx.entityId)).length,
  values: (fx, label) => ({
    entityId: fx.entityId,
    type: "email",
    platform: "",
    value: label,
    confidence: "unverified",
    status: "unknown",
  }),
  patch: (_row, label) => ({ value: label }),
  uniqueIndex: {
    values: (fx) => ({
      entityId: fx.entityId,
      type: "email",
      platform: "",
      value: "dup@mailhost.test",
      confidence: "unverified",
      status: "unknown",
    }),
    collide: () => ({ value: "dup@mailhost.test" }),
  },
  evidence: {
    ids: async (fx) => [
      (await seedEvidence(db, fx.caseId, { label: "First cite" })).id,
      (await seedEvidence(db, fx.caseId, { label: "Second cite" })).id,
    ],
    linked: async (id) =>
      [
        ...((await evidenceLinksRepo.listForIdentifiers(db, [id])).get(id) ??
          []),
      ].sort(),
    describe: (rec) => ({ id: rec.id, version: rec.version }),
  },
});

/** An Edge's activity label is its predicate: one distinct predicate per name the suite uses. */
const EDGE_PREDICATES_BY_NAME: Readonly<Record<string, EdgePredicate>> = {
  "rolled back": "owns",
  inserted: "leads",
  bare: "founded",
  cited: "member_of",
  updated: "employee_of",
  first: "associate_of",
  second: "parent_of",
  a: "operates",
  b: "registers",
  x: "resolves_to",
};

function edgePredicate(name: string): EdgePredicate {
  const predicate = EDGE_PREDICATES_BY_NAME[name];
  if (predicate === undefined) throw new Error(`no predicate for "${name}"`);
  return predicate;
}

defineConformance<
  EdgeRow,
  EdgeWritten,
  Omit<NewEdge, "caseId">,
  EdgePatch,
  GraphFixture
>({
  name: "edges",
  table: edgesTable,
  historyKind: "edge",
  seed: () => seedGraphFixture(),
  rowOf: async (fx, id) => {
    const row = await edgesRepo.getInCase(db, fx.caseId, id ?? fx.edgeId);
    if (row === null) throw new Error("seeded edge missing");
    return row;
  },
  countRows: async (fx) =>
    (await edgesRepo.listForEntity(db, fx.caseId, fx.entityId)).length,
  label: edgePredicate,
  // The fixture's Edge runs entity -> other; new rows run the other way round.
  values: (fx, label) => ({
    fromId: fx.otherEntityId,
    toId: fx.entityId,
    predicate: edgePredicate(label),
    confidence: "unverified",
    notes: null,
  }),
  patch: (_row, label) => ({ predicate: edgePredicate(label) }),
  uniqueIndex: {
    values: (fx) => ({
      fromId: fx.otherEntityId,
      toId: fx.entityId,
      predicate: "dns_via",
      confidence: "unverified",
      notes: null,
    }),
    collide: (row) => ({
      fromId: row.toId,
      toId: row.fromId,
      predicate: "dns_via",
    }),
  },
  evidence: {
    ids: async (fx) => [
      (await seedEvidence(db, fx.caseId, { label: "First cite" })).id,
      (await seedEvidence(db, fx.caseId, { label: "Second cite" })).id,
    ],
    linked: async (id) =>
      [
        ...((await evidenceLinksRepo.listForEdges(db, [id])).get(id) ?? []),
      ].sort(),
    describe: (rec) => ({ id: rec.id, version: rec.version }),
  },
});

/**
 * The Entity under test has no edges, claims or events of its own, so deleting it cascades
 * nothing: the suite counts exactly one history row per write.
 */
type EntityCtx = GraphFixture & { bareEntityId: string };

defineConformance<
  EntityRow,
  EntityRecord,
  Omit<NewEntity, "caseId">,
  EntityPatch,
  EntityCtx
>({
  name: "entities",
  table: entitiesTable,
  historyKind: "entity",
  seed: async () => {
    const fx = await seedGraphFixture();
    const bare = await seedEntity(db, fx.caseId, {
      id: testId(30),
      name: "Bare Entity",
      slug: "bare-entity",
      kind: "org",
    });
    return { ...fx, bareEntityId: bare.id };
  },
  rowOf: async (fx, id) => {
    const row = await entitiesRepo.getInCase(
      db,
      fx.caseId,
      id ?? fx.bareEntityId
    );
    if (row === null) throw new Error("seeded entity missing");
    return row;
  },
  countRows: async (fx) =>
    (await entitiesRepo.listForCase(db, fx.caseId)).length,
  // Kind `infra` seeds no default Questions, so an insert writes one row.
  values: (_fx, label) => ({
    kind: "infra",
    name: label,
    slug: slugifyName(label),
  }),
  patch: (_row, label) => ({ name: label }),
});

defineConformance<
  QuestionRow,
  QuestionRecord,
  Omit<NewQuestion, "caseId">,
  QuestionPatch,
  GraphFixture
>({
  name: "questions",
  table: questionsTable,
  historyKind: "question",
  seed: () => seedGraphFixture(),
  rowOf: async (fx, id) => {
    const row = await questionsRepo.getInCase(
      db,
      fx.caseId,
      id ?? fx.questionId
    );
    if (row === null) throw new Error("seeded question missing");
    return row;
  },
  countRows: async (fx) =>
    (await questionsRepo.listForEntity(db, fx.entityId)).length,
  values: (fx, label) => ({
    entityId: fx.entityId,
    text: label,
    status: "open",
  }),
  patch: (_row, label) => ({ text: label }),
  transition: {
    run: (w, id) =>
      w.transition(questionsTable, id, resolveQuestion, { resolvedNote: null }),
    action: "resolved",
    fromValue: "open",
    toValue: "resolved",
  },
});
