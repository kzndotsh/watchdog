import type { CollectRowKind, CollectRowState } from "../shared";
import { COLLECT_FIXTURE } from "./collect-queue-fixture";

/*
 * What Collect's 12-case fixture (`collect-queue-fixture.ts`) must produce, written out by hand:
 * never derived from the SQL or the reference.
 */

const E = COLLECT_FIXTURE.evidence;
const J = COLLECT_FIXTURE.jobs;
const R = COLLECT_FIXTURE.runs;

export type CollectFixtureRow = {
  readonly kind: CollectRowKind;
  readonly state: CollectRowState;
  readonly sortMinute: number;
  readonly activityMinute: number;
  readonly members: readonly string[];
};

/** The rows the fixture must produce, by id. Members in any order. */
export const COLLECT_FIXTURE_ROWS: Readonly<Record<string, CollectFixtureRow>> =
  {
    [E.plain]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 1,
      activityMinute: 1,
      members: [J.u],
    },
    [E.a]: {
      kind: "evidence",
      state: "unprocessed",
      sortMinute: 10,
      activityMinute: 10,
      members: [J.cap, J.p, J.x],
    },
    [E.b]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 113,
      activityMinute: 113,
      members: [J.k1, J.k2],
    },
    [E.c]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 21,
      activityMinute: 21,
      members: [J.l0],
    },
    [E.d]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 50,
      activityMinute: 50,
      members: [],
    },
    [E.e]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 51,
      activityMinute: 51,
      members: [],
    },
    [E.f]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 60,
      activityMinute: 60,
      members: [J.n1],
    },
    [E.g]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 61,
      activityMinute: 61,
      members: [],
    },
    [E.h]: {
      kind: "evidence",
      state: "hidden",
      sortMinute: 70,
      activityMinute: 70,
      members: [],
    },
    [E.t1]: {
      kind: "evidence",
      state: "landed",
      sortMinute: 80,
      activityMinute: 80,
      members: [J.x],
    },
    [E.t2]: {
      kind: "evidence",
      state: "unprocessed",
      sortMinute: 80,
      activityMinute: 80,
      members: [],
    },
    [J.u2]: {
      kind: "job",
      state: "landed",
      sortMinute: 5,
      activityMinute: 6,
      members: [J.u2],
    },
    [J.u3]: {
      kind: "job",
      state: "failed",
      sortMinute: 7,
      activityMinute: 8,
      members: [J.u3],
    },
    [J.run]: {
      kind: "job",
      state: "running",
      sortMinute: 90,
      activityMinute: 91,
      members: [J.run],
    },
    [J.f]: {
      kind: "job",
      state: "failed",
      sortMinute: 92,
      activityMinute: 93,
      members: [J.f],
    },
    [J.r]: {
      kind: "job",
      state: "queued",
      sortMinute: 94,
      activityMinute: 94,
      members: [J.r],
    },
    [R.r1]: {
      kind: "run",
      state: "running",
      sortMinute: 100,
      activityMinute: 107,
      members: [J.a0, J.a1, J.a1r, J.a2, J.a3],
    },
    [R.r2]: {
      kind: "run",
      state: "landed",
      sortMinute: 110,
      activityMinute: 111,
      members: [J.k0],
    },
    [J.m]: {
      kind: "job",
      state: "landed",
      sortMinute: 48,
      activityMinute: 50,
      members: [J.m],
    },
    [R.r4]: {
      kind: "run",
      state: "landed",
      sortMinute: 55,
      activityMinute: 60,
      members: [J.n0],
    },
    [J.q]: {
      kind: "job",
      state: "landed",
      sortMinute: 68,
      activityMinute: 120,
      members: [J.q],
    },
    [J.p2]: {
      kind: "job",
      state: "failed",
      sortMinute: 72,
      activityMinute: 120,
      members: [J.p2],
    },
  };

/** `activity.desc`: latest activity first, ties by id descending. */
export const COLLECT_FIXTURE_ORDER_ACTIVITY_DESC: readonly string[] = [
  J.p2,
  J.q,
  E.b,
  R.r2,
  R.r1,
  J.r,
  J.f,
  J.run,
  E.t2,
  E.t1,
  E.h,
  E.g,
  E.f,
  R.r4,
  E.e,
  E.d,
  J.m,
  E.c,
  E.a,
  J.u3,
  J.u2,
  E.plain,
];

/** `started.desc`: latest start first, ties by id descending. */
export const COLLECT_FIXTURE_ORDER_STARTED_DESC: readonly string[] = [
  E.b,
  R.r2,
  R.r1,
  J.r,
  J.f,
  J.run,
  E.t2,
  E.t1,
  J.p2,
  E.h,
  J.q,
  E.g,
  E.f,
  R.r4,
  E.e,
  E.d,
  J.m,
  E.c,
  E.a,
  J.u3,
  J.u2,
  E.plain,
];

/** `started.asc`: earliest start first, ties by id ascending. */
export const COLLECT_FIXTURE_ORDER_STARTED_ASC: readonly string[] = [
  E.plain,
  J.u2,
  J.u3,
  E.a,
  E.c,
  J.m,
  E.d,
  E.e,
  R.r4,
  E.f,
  E.g,
  J.q,
  E.h,
  J.p2,
  E.t1,
  E.t2,
  J.run,
  J.f,
  J.r,
  R.r1,
  R.r2,
  E.b,
];
