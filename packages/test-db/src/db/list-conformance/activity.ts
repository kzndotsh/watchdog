import { activity, cases, type DbExec } from "@watchdog/db";
import type { ActivityEntryKind } from "@watchdog/schemas/feed";
import {
  asCaseId,
  type CaseId,
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
  /** The log id is `ID_BASE + n`: ids rise with `n`, so the newer of two equal minutes is the larger `n`. */
  readonly n: number;
  readonly caseN: 1 | 2;
  readonly kind: ActivityEntryKind;
  readonly action: string;
  readonly minute: number;
  readonly group?: 1 | 2 | 3;
};

/* Past any identity value the test database has handed out. */
const ID_BASE = 910_000;
const CASE_1 = asCaseId(testId(700));
const CASE_2 = asCaseId(testId(701));
const GONE = asCaseId(testId(702));
const FOREIGN = asCaseId(testId(703));
const groupOf = (group: 1 | 2 | 3) => testId(720 + group);

/*
 * The feed's rows: the newest admitted entry of every run, in a visible Case of the organization.
 * Written minutes tie in threes (10, 20) and threes (30). a04 is the newest of run 1 (its twin at
 * the same minute has the smaller id), a07 the newest of run 2, and a11 the newest ADMITTED
 * entry of run 3 (a newer `logged` entry of the run is not a feed row).
 */
const ROWS: readonly Seeded[] = [
  { n: 1, caseN: 1, kind: "task", action: "created", minute: 10 },
  { n: 2, caseN: 1, kind: "job", action: "queued", minute: 20 },
  { n: 3, caseN: 2, kind: "evidence", action: "captured", minute: 10 },
  { n: 4, caseN: 2, kind: "job", action: "succeeded", minute: 30, group: 1 },
  { n: 5, caseN: 1, kind: "proposal", action: "accepted", minute: 20 },
  { n: 6, caseN: 2, kind: "open_in", action: "opened", minute: 30 },
  { n: 7, caseN: 1, kind: "job", action: "running", minute: 10, group: 2 },
  { n: 8, caseN: 2, kind: "task", action: "deleted", minute: 40 },
  { n: 9, caseN: 1, kind: "job", action: "failed", minute: 20 },
  { n: 10, caseN: 2, kind: "task", action: "status_changed", minute: 30 },
  { n: 11, caseN: 1, kind: "job", action: "succeeded", minute: 15, group: 3 },
];

const tagOf = (n: number) => `a${String(n).padStart(2, "0")}`;
const caseOf = (seeded: Seeded) => (seeded.caseN === 1 ? CASE_1 : CASE_2);

type Entry = {
  readonly id: number;
  readonly caseId: CaseId;
  readonly organizationId: OrganizationId;
  readonly kind: ActivityEntryKind;
  readonly action: string;
  readonly groupId: string | null;
  readonly createdAt: Date;
};

function entryOf(seeded: Seeded): Entry {
  return {
    id: ID_BASE + seeded.n,
    caseId: caseOf(seeded),
    organizationId: TEST_ORGANIZATION_ID,
    kind: seeded.kind,
    action: seeded.action,
    groupId: seeded.group === undefined ? null : groupOf(seeded.group),
    createdAt: at(seeded.minute),
  };
}

function caseValues(id: CaseId, organizationId: OrganizationId, n: number) {
  return {
    id,
    organizationId,
    name: `Activity case ${n}`,
    slug: `activity-case-${n}`,
  };
}

function decoy(
  n: number,
  caseId: CaseId,
  kind: ActivityEntryKind,
  action: string,
  minute: number,
  extra: Partial<Pick<Entry, "organizationId" | "groupId">> = {}
): Entry {
  return {
    id: ID_BASE + n,
    caseId,
    organizationId: TEST_ORGANIZATION_ID,
    kind,
    action,
    groupId: null,
    createdAt: at(minute),
    ...extra,
  };
}

export const activityConformance: ListConformance = {
  list: "activity",
  pageLimit: 3,
  rows: ROWS.map((row) => ({
    tag: tagOf(row.n),
    id: String(ID_BASE + row.n),
    facts: { caseId: caseOf(row) },
  })),
  async seed(exec: DbExec) {
    await exec.insert(cases).values([
      caseValues(CASE_1, TEST_ORGANIZATION_ID, 1),
      caseValues(CASE_2, TEST_ORGANIZATION_ID, 2),
      caseValues(FOREIGN, TEST_OTHER_ORGANIZATION_ID, 4),
      {
        ...caseValues(GONE, TEST_ORGANIZATION_ID, 3),
        deletedAt: at(1),
        deletedBy: null,
        purgeAfter: at(100),
      },
    ]);
    await exec
      .insert(activity)
      .overridingSystemValue()
      .values([
        ...ROWS.map((row) => entryOf(row)),
        // Older members of runs 1 and 2, and a twin of a04 at its minute with the smaller id:
        // collapsed into the run's newest entry.
        decoy(0, CASE_2, "job", "running", 30, { groupId: groupOf(1) }),
        decoy(21, CASE_2, "job", "queued", 5, { groupId: groupOf(1) }),
        decoy(22, CASE_1, "job", "queued", 5, { groupId: groupOf(2) }),
        // Not in the allowlist, newest of all (and of run 3): never a row.
        decoy(23, CASE_1, "job", "logged", 45, { groupId: groupOf(3) }),
        decoy(24, CASE_1, "task", "updated", 50),
        decoy(25, CASE_1, "evidence", "hidden", 50),
        // A tombstoned Case's history, and another organization's.
        decoy(26, GONE, "job", "queued", 50),
        decoy(27, FOREIGN, "task", "created", 50, {
          organizationId: TEST_OTHER_ORGANIZATION_ID,
        }),
      ]);
    return {
      scope: { organizationId: TEST_ORGANIZATION_ID },
      otherScope: { organizationId: TEST_OTHER_ORGANIZATION_ID },
      wire: {},
    };
  },
  orders: {
    "at.desc": [
      "a08",
      "a10",
      "a06",
      "a04",
      "a09",
      "a05",
      "a02",
      "a11",
      "a07",
      "a03",
      "a01",
    ],
    "at.asc": [
      "a01",
      "a03",
      "a07",
      "a11",
      "a02",
      "a05",
      "a09",
      "a04",
      "a06",
      "a10",
      "a08",
    ],
  },
  reference: {
    caseId: (facts, id) => id === null || facts.caseId === id,
  },
  samples: {
    caseId: [CASE_1, CASE_2],
  },
  searches: [],
};
