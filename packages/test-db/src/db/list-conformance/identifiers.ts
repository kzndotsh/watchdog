import { identifiers, type DbExec } from "@watchdog/db";
import type {
  CaseId,
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit/fixtures";

import { seedCase } from "../seed/case.ts";
import { seedEntity } from "../seed/entity.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { at, inChoices } from "./types.ts";
import type { ListConformance } from "./types.ts";

const ENTITY_A = testId(211);
const ENTITY_B = testId(212);
const ENTITY_DECOY = testId(213);

type Seeded = {
  readonly n: number;
  readonly entity: "A" | "B";
  readonly type: IdentifierType;
  readonly platform?: string;
  readonly value: string;
  readonly status: IdentifierStatus;
  readonly confidence: ConfidenceTier;
  readonly notes?: string;
  readonly minute: number;
};

/*
 * Ids rise with `n`. Values are lowercase and differ first at a letter, so their order is the
 * same under every collation; "bravo" ties three ways (two Entities, two types). Added minutes
 * tie in threes (10, 20) and twos (30).
 */
const ROWS: readonly Seeded[] = [
  {
    n: 1,
    entity: "A",
    type: "email",
    value: "kilo@example.test",
    status: "unknown",
    confidence: "unverified",
    minute: 10,
  },
  {
    n: 2,
    entity: "A",
    type: "handle",
    platform: "github",
    value: "bravo",
    status: "current",
    confidence: "possible",
    notes: "main_account",
    minute: 20,
  },
  {
    n: 3,
    entity: "B",
    type: "email",
    value: "bravo",
    status: "unknown",
    confidence: "confirmed",
    minute: 10,
  },
  {
    n: 4,
    entity: "B",
    type: "phone",
    value: "echo 100",
    status: "former",
    confidence: "unverified",
    notes: "100% sure",
    minute: 30,
  },
  {
    n: 5,
    entity: "A",
    type: "domain",
    value: "india.example.test",
    status: "current",
    confidence: "confirmed",
    minute: 20,
  },
  {
    n: 6,
    entity: "B",
    type: "handle",
    platform: "gitlab",
    value: "bravo",
    status: "unknown",
    confidence: "possible",
    notes: "mainXaccount",
    minute: 30,
  },
  {
    n: 7,
    entity: "A",
    type: "url",
    value: "golf.example.test/x",
    status: "former",
    confidence: "possible",
    notes: "1000 sure",
    minute: 10,
  },
  {
    n: 8,
    entity: "B",
    type: "other",
    value: "alpha",
    status: "unknown",
    confidence: "unverified",
    minute: 20,
  },
];

function insertValues(seeded: Seeded, caseId: CaseId, entityId: string) {
  return {
    id: testId(400 + seeded.n),
    entityId,
    caseId,
    type: seeded.type,
    platform: seeded.platform ?? "",
    value: seeded.value,
    status: seeded.status,
    confidence: seeded.confidence,
    notes: seeded.notes ?? null,
    createdAt: at(seeded.minute),
    // Reversed against `created_at`, so each sort is held to its own column.
    updatedAt: at(100 - seeded.minute),
  };
}

const tagOf = (n: number) => `i${String(n).padStart(2, "0")}`;
const entityIdOf = (entity: Seeded["entity"]) =>
  entity === "A" ? ENTITY_A : ENTITY_B;

export const identifierConformance: ListConformance = {
  list: "identifiers",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(400 + row.n),
    facts: {
      entityId: entityIdOf(row.entity),
      type: row.type,
      status: row.status,
      confidence: row.confidence,
    },
  })),
  async seed(exec: DbExec) {
    const owner = await seedCase(exec, { name: "List conformance" });
    const other = await seedCase(exec, { name: "List conformance decoy" });
    await seedEntity(exec, owner.id, { id: ENTITY_A, name: "A", slug: "a" });
    await seedEntity(exec, owner.id, { id: ENTITY_B, name: "B", slug: "b" });
    await seedEntity(exec, other.id, {
      id: ENTITY_DECOY,
      name: "Decoy",
      slug: "decoy",
    });
    await withSystemHistoryContext(exec, async (tx) => {
      await tx
        .insert(identifiers)
        .values(
          ROWS.map((seeded) =>
            insertValues(seeded, owner.id, entityIdOf(seeded.entity))
          )
        );
      // A decoy in another Case that matches every search and sits first in every order.
      await tx.insert(identifiers).values(
        insertValues(
          {
            n: 90,
            entity: "A",
            type: "email",
            value: "aaa example.test 100% n_a",
            status: "former",
            confidence: "possible",
            minute: 50,
          },
          other.id,
          ENTITY_DECOY
        )
      );
    });
    return {
      scope: { caseId: owner.id },
      otherScope: { caseId: other.id },
      wire: { caseId: owner.id },
    };
  },
  orders: {
    "value.asc": ["i08", "i02", "i03", "i06", "i04", "i07", "i05", "i01"],
    "value.desc": ["i01", "i05", "i07", "i04", "i06", "i03", "i02", "i08"],
    "created.desc": ["i06", "i04", "i08", "i05", "i02", "i07", "i03", "i01"],
    "created.asc": ["i01", "i03", "i07", "i02", "i05", "i08", "i04", "i06"],
    "updated.desc": ["i07", "i03", "i01", "i08", "i05", "i02", "i06", "i04"],
    "updated.asc": ["i04", "i06", "i02", "i05", "i08", "i01", "i03", "i07"],
  },
  reference: {
    type: (facts, types) => inChoices(types, facts.type),
    status: (facts, statuses) => inChoices(statuses, facts.status),
    confidence: (facts, tiers) => inChoices(tiers, facts.confidence),
    entityId: (facts, id) => id === null || facts.entityId === id,
  },
  samples: {
    type: [["email"], ["handle", "email"]],
    status: [["former"]],
    confidence: [["possible", "confirmed"]],
    entityId: [ENTITY_A, ENTITY_B, testId(299)],
  },
  searches: [
    { q: "example.test", expect: ["i07", "i05", "i01"] },
    // literal `%` and `_`: as wildcards they would also find i07 ("1000 sure") and i06
    { q: "100%", expect: ["i04"] },
    { q: "n_a", expect: ["i02"] },
    { q: "GITLAB", expect: ["i06"] },
    // display labels of `status` ("Former") and `confidence` ("Possible")
    { q: "former", expect: ["i04", "i07"] },
    { q: "possible", expect: ["i02", "i06", "i07"] },
    // `%` stays literal on the display-label path too: no label contains "for%mer"
    { q: "for%mer", expect: [] },
    { q: "possib_e", expect: [] },
    { q: "bravo", filters: { entityId: ENTITY_B }, expect: ["i03", "i06"] },
  ],
};
