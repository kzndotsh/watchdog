import { evidence, type DbExec, type NewEvidence } from "@watchdog/db";
import type { CaseId, EvidenceKind } from "@watchdog/schemas/shared";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { at, inChoices } from "./types.ts";
import type { ConformanceFacts, ListConformance } from "./types.ts";

const ENTITY_A = testId(201);
const ENTITY_B = testId(202);

type Seeded = {
  readonly n: number;
  readonly minute: number;
  readonly label: string | null;
  readonly kind: EvidenceKind;
  readonly entity?: "A" | "B";
  readonly processed?: true;
  readonly deleted?: true;
  readonly notes?: string;
  readonly sourceUrl?: string;
};

/*
 * Ids rise with `n` (testId), so an id tie-break reads straight off the tag. Captured minutes
 * tie in fours (10, 20, 30) and labels tie three ways, with NULL and '' together at the front of
 * the label sort (the '' sentinel). e06 and e10 are hidden (soft-deleted).
 */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    minute: 10,
    label: "bravo",
    kind: "file",
    entity: "A",
    processed: true,
    sourceUrl: "https://example.test/a",
  },
  { n: 2, minute: 30, label: null, kind: "attestation", notes: "50% off" },
  {
    n: 3,
    minute: 10,
    label: "alpha",
    kind: "url_archive",
    entity: "B",
    processed: true,
    sourceUrl: "https://www.example.test/b",
  },
  { n: 4, minute: 20, label: "", kind: "other" },
  {
    n: 5,
    minute: 30,
    label: "alpha",
    kind: "file",
    entity: "A",
    notes: "under_score",
  },
  { n: 6, minute: 20, label: "charlie", kind: "other", deleted: true },
  { n: 7, minute: 10, label: null, kind: "attestation", processed: true },
  {
    n: 8,
    minute: 30,
    label: "bravo",
    kind: "other",
    entity: "B",
    notes: "needle in notes",
  },
  {
    n: 9,
    minute: 20,
    label: "alpha",
    kind: "attestation",
    entity: "A",
    processed: true,
    notes: "500 off",
  },
  {
    n: 10,
    minute: 10,
    label: "delta",
    kind: "file",
    entity: "A",
    processed: true,
    deleted: true,
  },
  {
    n: 11,
    minute: 40,
    label: "bravo",
    kind: "url_archive",
    sourceUrl: "https://example.test/c",
  },
  {
    n: 12,
    minute: 20,
    label: null,
    kind: "file",
    entity: "B",
    notes: "underXscore",
  },
];

const tagOf = (n: number) => `e${String(n).padStart(2, "0")}`;
function entityIdOf(entity: Seeded["entity"]): string | null {
  if (entity === undefined) return null;
  return entity === "A" ? ENTITY_A : ENTITY_B;
}

function factsOf(row: Seeded): ConformanceFacts {
  return {
    deleted: row.deleted === true,
    processed: row.processed === true,
    entityId: entityIdOf(row.entity),
    kind: row.kind,
  };
}

function valuesOf(row: Seeded, caseId: CaseId): NewEvidence & { id: string } {
  return {
    id: testId(300 + row.n),
    caseId,
    entityId: entityIdOf(row.entity),
    kind: row.kind,
    label: row.label,
    notes: row.notes ?? null,
    mime: "text/plain",
    uri: null,
    sha256: null,
    text: "conformance body",
    sourceUrl: row.sourceUrl ?? null,
    actorId: TEST_ACTOR_ID,
  };
}

export const evidenceConformance: ListConformance = {
  list: "evidence",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(300 + row.n),
    facts: factsOf(row),
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await seedEntity(exec, owner.id, { id: ENTITY_A, name: "A", slug: "a" });
    await seedEntity(exec, owner.id, { id: ENTITY_B, name: "B", slug: "b" });
    await exec.insert(evidence).values(
      ROWS.map((row) => ({
        ...valuesOf(row, owner.id),
        capturedAt: at(row.minute),
        processedAt: row.processed === true ? at(99) : null,
        deletedAt: row.deleted === true ? at(99) : null,
      }))
    );
    // A decoy in another Case that matches every search and sits first in every order.
    await exec.insert(evidence).values({
      ...valuesOf(
        { n: 90, minute: 50, label: "", kind: "url_archive" },
        other.id
      ),
      notes: "needle 50% under_score alpha",
      capturedAt: at(50),
    });
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "captured.desc": [
      "e11",
      "e08",
      "e05",
      "e02",
      "e12",
      "e09",
      "e04",
      "e07",
      "e03",
      "e01",
    ],
    "captured.asc": [
      "e01",
      "e03",
      "e07",
      "e04",
      "e09",
      "e12",
      "e02",
      "e05",
      "e08",
      "e11",
    ],
    "label.asc": [
      "e02",
      "e04",
      "e07",
      "e12",
      "e03",
      "e05",
      "e09",
      "e01",
      "e08",
      "e11",
    ],
    "label.desc": [
      "e11",
      "e08",
      "e01",
      "e09",
      "e05",
      "e03",
      "e12",
      "e07",
      "e04",
      "e02",
    ],
  },
  reference: {
    hidden: (facts, isOn) => facts.deleted === (isOn === true),
    unprocessed: (facts, isOn) => isOn !== true || facts.processed === false,
    unattached: (facts, isOn) => isOn !== true || facts.entityId === null,
    kind: (facts, kinds) => inChoices(kinds, facts.kind),
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    hidden: [true],
    unprocessed: [true],
    unattached: [true],
    kind: [["file"], ["other", "file"]],
    entityId: [ENTITY_A, ENTITY_B, testId(299)],
  },
  searches: [
    { q: "needle", expect: ["e08"] },
    // literal `%` and `_`: as wildcards they would also find e09 ("500 off") and e12
    { q: "50%", expect: ["e02"] },
    { q: "r_s", expect: ["e05"] },
    { q: "ALPHA", expect: ["e05", "e09", "e03"] },
    { q: "example.test", expect: ["e11", "e03", "e01"] },
    // a kind's display label ("URL Archive")
    { q: "url archive", expect: ["e11", "e03"] },
    { q: "charlie", expect: [] },
    { q: "charlie", filters: { hidden: true }, expect: ["e06"] },
    { q: "alpha", filters: { kind: ["file"] }, expect: ["e05"] },
  ],
};
