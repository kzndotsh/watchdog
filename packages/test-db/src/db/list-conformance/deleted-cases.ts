import { cases, type DbExec } from "@watchdog/db";
import { asCaseId, type OrganizationId } from "@watchdog/schemas/shared";
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
  readonly minute: number;
  readonly purging?: true;
};

/*
 * Ids rise with `n`. Names are lowercase and differ first at a letter (or are a prefix of
 * another), so their order is the same under every collation; "bravo" ties twice (d03, d09).
 * Deletion minutes tie in threes (10, 20, 30). d02, d05 and d08 have begun their purge.
 */
const ROWS: readonly Seeded[] = [
  { n: 1, name: "kilo", minute: 10 },
  {
    n: 2,
    name: "bravo works",
    description: "main_account",
    minute: 20,
    purging: true,
  },
  { n: 3, name: "bravo", description: "100% sure", minute: 10 },
  { n: 4, name: "echo host", description: "mainXaccount", minute: 30 },
  { n: 5, name: "alpha", minute: 20, purging: true },
  { n: 6, name: "golf", description: "1000 sure", minute: 30 },
  { n: 7, name: "india", description: "example.test site", minute: 10 },
  {
    n: 8,
    name: "hotel",
    description: "example.test",
    minute: 20,
    purging: true,
  },
  { n: 9, name: "bravo", minute: 30 },
];

const tagOf = (n: number) => `d${String(n).padStart(2, "0")}`;
const slugOf = (n: number) => `cs-${String(n).padStart(2, "0")}`;

function insertValues(
  seeded: Seeded,
  organizationId: OrganizationId,
  tombstone: boolean
) {
  return {
    id: asCaseId(testId(600 + seeded.n)),
    organizationId,
    name: seeded.name,
    slug: slugOf(seeded.n),
    description: seeded.description ?? null,
    deletedAt: tombstone ? at(seeded.minute) : null,
    deletedBy: null,
    purgeAfter: tombstone ? at(seeded.minute + 60) : null,
    purgeStartedAt: seeded.purging === true ? at(seeded.minute + 1) : null,
  };
}

export const deletedCaseConformance: ListConformance = {
  list: "deleted-cases",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: testId(600 + row.n),
    facts: { purging: row.purging === true },
  })),
  async seed(exec: DbExec) {
    // Decoys that match every search and sit first in every order: a tombstone in another
    // organization, and a live Case (never listed) in this one.
    const decoy = {
      name: "aaa bravo example.test 100% n_a cs-05",
      description: "aaa bravo example.test 100% n_a cs-05",
      minute: 50,
    };
    await exec
      .insert(cases)
      .values([
        ...ROWS.map((row) => insertValues(row, TEST_ORGANIZATION_ID, true)),
        insertValues({ n: 90, ...decoy }, TEST_OTHER_ORGANIZATION_ID, true),
        insertValues({ n: 91, ...decoy }, TEST_ORGANIZATION_ID, false),
      ]);
    return {
      scope: { organizationId: TEST_ORGANIZATION_ID },
      otherScope: { organizationId: TEST_OTHER_ORGANIZATION_ID },
      wire: {},
    };
  },
  orders: {
    "name.asc": ["d05", "d03", "d09", "d02", "d04", "d06", "d08", "d07", "d01"],
    "name.desc": [
      "d01",
      "d07",
      "d08",
      "d06",
      "d04",
      "d02",
      "d09",
      "d03",
      "d05",
    ],
    "deleted.desc": [
      "d09",
      "d06",
      "d04",
      "d08",
      "d05",
      "d02",
      "d07",
      "d03",
      "d01",
    ],
    "deleted.asc": [
      "d01",
      "d03",
      "d07",
      "d02",
      "d05",
      "d08",
      "d04",
      "d06",
      "d09",
    ],
  },
  reference: {
    purging: (facts, isOn) => isOn !== true || facts.purging === true,
  },
  samples: {
    purging: [true],
  },
  searches: [
    // description
    { q: "example.test", expect: ["d08", "d07"] },
    { q: "sure", expect: ["d06", "d03"] },
    // literal `%` and `_`: as wildcards they would also find d06 ("1000 sure") and d04
    { q: "100%", expect: ["d03"] },
    { q: "n_a", expect: ["d02"] },
    { q: "in_ia", expect: [] },
    { q: "BRAVO", expect: ["d09", "d02", "d03"] },
    // the link
    { q: "cs-05", expect: ["d05"] },
    { q: "bravo", filters: { purging: true }, expect: ["d02"] },
  ],
};
