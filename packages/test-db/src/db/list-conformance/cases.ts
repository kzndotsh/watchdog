import { cases, type DbExec } from "@watchdog/db";
import {
  asCaseId,
  type EgressClass,
  type OrganizationId,
} from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit/fixtures";

import { at } from "./types.ts";
import type { ListConformance } from "./types.ts";

type Seeded = {
  readonly n: number;
  readonly name: string;
  readonly description?: string;
  readonly createdMinute: number;
  readonly updatedMinute: number;
  /** Allows nothing beyond `local`. */
  readonly localOnly?: true;
};

/*
 * Ids rise with `n`. Names are lowercase and differ first at a letter (or are a prefix of
 * another), so their order is the same under every collation; "bravo" ties twice (c03, c09).
 * Created minutes tie in threes (10, 20, 30) and updated minutes in threes (40, 50, 60). c02, c05
 * and c08 allow nothing beyond `local`.
 */
const ROWS: readonly Seeded[] = [
  { n: 1, name: "kilo", createdMinute: 10, updatedMinute: 40 },
  {
    n: 2,
    name: "bravo works",
    description: "main_account",
    createdMinute: 20,
    updatedMinute: 40,
    localOnly: true,
  },
  {
    n: 3,
    name: "bravo",
    description: "100% sure",
    createdMinute: 10,
    updatedMinute: 50,
  },
  {
    n: 4,
    name: "echo host",
    description: "mainXaccount",
    createdMinute: 30,
    updatedMinute: 60,
  },
  {
    n: 5,
    name: "alpha",
    createdMinute: 20,
    updatedMinute: 60,
    localOnly: true,
  },
  {
    n: 6,
    name: "golf",
    description: "1000 sure",
    createdMinute: 30,
    updatedMinute: 40,
  },
  {
    n: 7,
    name: "india",
    description: "example.test site",
    createdMinute: 10,
    updatedMinute: 50,
  },
  {
    n: 8,
    name: "hotel",
    description: "example.test",
    createdMinute: 20,
    updatedMinute: 60,
    localOnly: true,
  },
  { n: 9, name: "bravo", createdMinute: 30, updatedMinute: 50 },
];

const tagOf = (n: number) => `c${String(n).padStart(2, "0")}`;
const slugOf = (n: number) => `cs-${String(n).padStart(2, "0")}`;

const LOCAL_ONLY: EgressClass[] = ["local"];
const DEFAULT_EGRESS: EgressClass[] = ["local", "target"];

function insertValues(
  seeded: Seeded,
  organizationId: OrganizationId,
  tombstone: boolean
) {
  return {
    id: asCaseId(testId(700 + seeded.n)),
    organizationId,
    name: seeded.name,
    slug: slugOf(seeded.n),
    description: seeded.description ?? null,
    allowedEgress: seeded.localOnly === true ? LOCAL_ONLY : DEFAULT_EGRESS,
    createdAt: at(seeded.createdMinute),
    updatedAt: at(seeded.updatedMinute),
    deletedAt: tombstone ? at(seeded.createdMinute) : null,
    deletedBy: null,
    purgeAfter: tombstone ? at(seeded.createdMinute + 60) : null,
  };
}

export const caseConformance: ListConformance = {
  list: "cases",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(700 + row.n),
    facts: { localOnly: row.localOnly === true },
  })),
  async seed(exec: DbExec) {
    // Decoys that match every search and sort first in the ascending orders: a live Case in
    // another organization, and a tombstone (never listed) in this one.
    const decoy = {
      name: "aaa bravo example.test 100% n_a cs-05",
      description: "aaa bravo example.test 100% n_a cs-05",
      createdMinute: 1,
      updatedMinute: 1,
      localOnly: true,
    } as const;
    await exec
      .insert(cases)
      .values([
        ...ROWS.map((row) => insertValues(row, TEST_ORGANIZATION_ID, false)),
        insertValues({ n: 90, ...decoy }, TEST_OTHER_ORGANIZATION_ID, false),
        insertValues({ n: 91, ...decoy }, TEST_ORGANIZATION_ID, true),
      ]);
    return {
      scope: { organizationId: TEST_ORGANIZATION_ID },
      otherScope: { organizationId: TEST_OTHER_ORGANIZATION_ID },
      wire: {},
    };
  },
  orders: {
    "name.asc": ["c05", "c03", "c09", "c02", "c04", "c06", "c08", "c07", "c01"],
    "name.desc": [
      "c01",
      "c07",
      "c08",
      "c06",
      "c04",
      "c02",
      "c09",
      "c03",
      "c05",
    ],
    "created.desc": [
      "c09",
      "c06",
      "c04",
      "c08",
      "c05",
      "c02",
      "c07",
      "c03",
      "c01",
    ],
    "created.asc": [
      "c01",
      "c03",
      "c07",
      "c02",
      "c05",
      "c08",
      "c04",
      "c06",
      "c09",
    ],
    "updated.desc": [
      "c08",
      "c05",
      "c04",
      "c09",
      "c07",
      "c03",
      "c06",
      "c02",
      "c01",
    ],
    "updated.asc": [
      "c01",
      "c02",
      "c06",
      "c03",
      "c07",
      "c09",
      "c04",
      "c05",
      "c08",
    ],
  },
  reference: {
    localOnly: (facts, isOn) => isOn !== true || facts.localOnly === true,
  },
  samples: {
    localOnly: [true],
  },
  searches: [
    // description
    { q: "example.test", expect: ["c08", "c07"] },
    { q: "sure", expect: ["c03", "c06"] },
    // literal `%` and `_`: as wildcards they would also find c06 ("1000 sure") and c04
    { q: "100%", expect: ["c03"] },
    { q: "n_a", expect: ["c02"] },
    { q: "in_ia", expect: [] },
    { q: "BRAVO", expect: ["c03", "c09", "c02"] },
    // the link
    { q: "cs-05", expect: ["c05"] },
    { q: "bravo", filters: { localOnly: true }, expect: ["c02"] },
  ],
};
