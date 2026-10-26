import { testId } from "@watchdog/test-kit/fixtures";

import type { JsonObject } from "../json";
import type { JobStatus } from "../shared";
import type {
  CollectSource,
  CollectSourceEvidence,
  CollectSourceJob,
  CollectSourceRun,
} from "./collect-queue-reference";

/**
 * The 12-case fixture of Collect's queue (#574): one Case whose Evidence, Jobs and runs cover
 * every rule of the builder, with explicit times, and the rows it must produce written out by
 * hand (never derived from the SQL or the reference). Evidence ids hold hex letters, so an
 * uppercase copy differs from the stored id.
 */

const BASE_MICROS = Date.UTC(2026, 0, 1) * 1000;

/** `n` minutes after the fixture's base time, in microseconds. */
export function fixtureMinute(n: number): number {
  return BASE_MICROS + Math.round(n * 60_000_000);
}

const m = fixtureMinute;

export const COLLECT_FIXTURE = {
  evidence: {
    plain: testId(0xe_01),
    a: testId(0xe_02),
    b: testId(0xe_03),
    c: testId(0xe_04),
    d: testId(0xe_05),
    e: testId(0xe_06),
    f: testId(0xe_07),
    g: testId(0xe_08),
    h: testId(0xe_09),
    t1: testId(0xe_0a),
    t2: testId(0xe_0b),
  },
  jobs: {
    cap: testId(0xb_01),
    p: testId(0xb_02),
    u: testId(0xb_03),
    u2: testId(0xb_04),
    u3: testId(0xb_05),
    run: testId(0xb_06),
    f: testId(0xb_07),
    r: testId(0xb_08),
    a0: testId(0xb_09),
    a1: testId(0xb_0a),
    a1r: testId(0xb_0b),
    a2: testId(0xb_0c),
    a3: testId(0xb_0d),
    k0: testId(0xb_0e),
    k1: testId(0xb_0f),
    k2: testId(0xb_10),
    l0: testId(0xb_11),
    m: testId(0xb_12),
    n0: testId(0xb_13),
    n1: testId(0xb_14),
    q: testId(0xb_15),
    p2: testId(0xb_16),
    x: testId(0xb_17),
  },
  runs: {
    r1: testId(0xc_01),
    r2: testId(0xc_02),
    r3: testId(0xc_03),
    r4: testId(0xc_04),
    r5: testId(0xc_05),
  },
} as const;

const E = COLLECT_FIXTURE.evidence;
const J = COLLECT_FIXTURE.jobs;
const R = COLLECT_FIXTURE.runs;

/** Playbook placement of a fixture Job (`playbook_step`, `playbook_fan_index`), for the seed. */
export type CollectFixtureStep = {
  readonly step: number;
  readonly fan: number;
};

export type CollectFixtureJob = CollectSourceJob & {
  readonly playbook: CollectFixtureStep | null;
};

function evidence(
  id: string,
  capturedMinute: number,
  opts: { processed?: boolean; hiddenMinute?: number; label?: string } = {}
): CollectSourceEvidence {
  return {
    id,
    capturedAt: m(capturedMinute),
    processedAt: opts.processed === false ? null : m(capturedMinute),
    deletedAt: opts.hiddenMinute === undefined ? null : m(opts.hiddenMinute),
    entityId: null,
    label: opts.label ?? `Fixture evidence ${id.slice(-3)}`,
    notes: null,
    sourceUrl: `https://collect.example/${id.slice(-3)}`,
  };
}

type JobSpec = {
  readonly id: string;
  readonly cap?: string;
  readonly status: JobStatus;
  readonly created: number;
  readonly started?: number;
  readonly finished?: number;
  readonly input?: JsonObject;
  readonly run?: string;
  readonly playbook?: CollectFixtureStep;
  readonly retryOf?: string;
  readonly landed?: readonly string[];
  readonly error?: string;
};

function job(spec: JobSpec): CollectFixtureJob {
  return {
    id: spec.id,
    capabilityId: spec.cap ?? "network.dns.lookup",
    status: spec.status,
    input: spec.input ?? { host: `host-${spec.id.slice(-3)}.example` },
    playbookRunId: spec.run ?? null,
    retryOfJobId: spec.retryOf ?? null,
    evidenceIds: spec.landed ?? [],
    createdAt: m(spec.created),
    startedAt: spec.started === undefined ? null : m(spec.started),
    finishedAt: spec.finished === undefined ? null : m(spec.finished),
    resultSummary: spec.status === "succeeded" ? "Fixture result" : null,
    error: spec.error ?? null,
    interpretError: null,
    playbook: spec.playbook ?? null,
  };
}

/** U+3000, which JavaScript's `trim` removes. */
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x30_00);

const HARVEST = "evidence.harvest";
const EXTRACT = "evidence.extract.ai";
const ENRICH = "network.url.enrich";

export const COLLECT_FIXTURE_RUNS: readonly CollectSourceRun[] = [
  { id: R.r1, playbookId: "host-footprint", createdAt: m(100) },
  { id: R.r2, playbookId: "url-capture", createdAt: m(110) },
  { id: R.r3, playbookId: "url-capture", createdAt: m(20) },
  { id: R.r4, playbookId: "url-capture", createdAt: m(55) },
  { id: R.r5, playbookId: "url-capture", createdAt: m(75) },
];

export const COLLECT_FIXTURE_EVIDENCE: readonly CollectSourceEvidence[] = [
  evidence(E.plain, 1, { label: "Pasted carrier lookup" }),
  evidence(E.a, 10, { processed: false }),
  evidence(E.b, 113),
  evidence(E.c, 21),
  evidence(E.d, 50),
  evidence(E.e, 51),
  evidence(E.f, 60),
  evidence(E.g, 61),
  evidence(E.h, 70, { hiddenMinute: 120 }),
  evidence(E.t1, 80),
  evidence(E.t2, 80, { processed: false }),
];

export const COLLECT_FIXTURE_JOBS: readonly CollectFixtureJob[] = [
  // 1. A Cap landed one row; a process Job links to it by input.
  job({
    id: J.cap,
    status: "succeeded",
    created: 9,
    started: 9.5,
    finished: 10,
    landed: [E.a],
  }),
  job({
    id: J.p,
    cap: HARVEST,
    status: "running",
    created: 11,
    started: 12,
    input: { evidenceId: E.a },
  }),
  // 2. Enrich by input, the id padded with whitespace.
  job({
    id: J.u,
    cap: ENRICH,
    status: "succeeded",
    created: 2,
    started: 3,
    finished: 4,
    input: { evidenceId: ` ${E.plain}${IDEOGRAPHIC_SPACE}` },
  }),
  // 2b. An uppercase id and a 36-dash string: no link, no error.
  job({
    id: J.u2,
    cap: ENRICH,
    status: "succeeded",
    created: 5,
    started: 5,
    finished: 6,
    input: { evidenceId: E.plain.toUpperCase() },
  }),
  job({
    id: J.u3,
    cap: ENRICH,
    status: "failed",
    created: 7,
    started: 7,
    finished: 8,
    input: { evidenceId: "-".repeat(36) },
    error: "Fixture failure",
  }),
  // 3. A lone Cap in flight.
  job({ id: J.run, status: "running", created: 90, started: 91 }),
  // 4. A lone retry: two rows.
  job({
    id: J.f,
    status: "failed",
    created: 92,
    started: 92,
    finished: 93,
    error: "Fixture failure",
  }),
  job({ id: J.r, status: "queued", created: 94, retryOf: J.f }),
  // 5. Fan-out and a retry in one run.
  job({
    id: J.a0,
    status: "succeeded",
    created: 100,
    started: 100,
    finished: 101,
    run: R.r1,
    playbook: { step: 0, fan: 0 },
  }),
  job({
    id: J.a1,
    status: "failed",
    created: 102,
    started: 102,
    finished: 103,
    run: R.r1,
    playbook: { step: 1, fan: 0 },
    error: "Fixture failure",
  }),
  job({
    id: J.a1r,
    status: "succeeded",
    created: 104,
    started: 104,
    finished: 105,
    run: R.r1,
    playbook: { step: 1, fan: 0 },
    retryOf: J.a1,
  }),
  job({
    id: J.a2,
    status: "running",
    created: 102,
    started: 106,
    run: R.r1,
    playbook: { step: 1, fan: 1 },
  }),
  job({
    id: J.a3,
    status: "running",
    created: 102,
    started: 107,
    run: R.r1,
    playbook: { step: 1, fan: 2 },
  }),
  // 6. Evidence on a later step; a later step linked to it by input.
  job({
    id: J.k0,
    status: "succeeded",
    created: 110,
    started: 110,
    finished: 111,
    run: R.r2,
    playbook: { step: 0, fan: 0 },
  }),
  job({
    id: J.k1,
    status: "succeeded",
    created: 112,
    started: 112,
    finished: 113,
    run: R.r2,
    playbook: { step: 1, fan: 0 },
    landed: [E.b],
  }),
  job({
    id: J.k2,
    status: "queued",
    created: 114,
    run: R.r2,
    playbook: { step: 2, fan: 0 },
    input: { evidenceId: E.b },
  }),
  // 7. A run whose only step attached.
  job({
    id: J.l0,
    status: "succeeded",
    created: 20,
    started: 20,
    finished: 21,
    run: R.r3,
    playbook: { step: 0, fan: 0 },
    landed: [E.c],
  }),
  // 8. A Job that landed two rows.
  job({
    id: J.m,
    status: "succeeded",
    created: 48,
    started: 48,
    finished: 50,
    landed: [E.d, E.e],
  }),
  // 9. A step that landed two rows, and a step linked to one of them by input.
  job({
    id: J.n0,
    status: "succeeded",
    created: 55,
    started: 55,
    finished: 60,
    run: R.r4,
    playbook: { step: 0, fan: 0 },
    landed: [E.f, E.g],
  }),
  job({
    id: J.n1,
    status: "succeeded",
    created: 62,
    started: 62,
    finished: 63,
    run: R.r4,
    playbook: { step: 1, fan: 0 },
    input: { evidenceId: E.f },
  }),
  // 10. A landing that was hidden: the link is gone, the rows rise to the hide.
  job({
    id: J.q,
    status: "succeeded",
    created: 68,
    started: 68,
    finished: 70,
    landed: [E.h],
  }),
  job({
    id: J.p2,
    cap: EXTRACT,
    status: "failed",
    created: 72,
    started: 72,
    finished: 73,
    input: { evidenceId: E.h },
    error: "Fixture failure",
  }),
  // 11. A step linked by input and by landing: a member of two Evidence rows.
  job({
    id: J.x,
    status: "succeeded",
    created: 78,
    started: 78,
    finished: 80,
    run: R.r5,
    playbook: { step: 1, fan: 0 },
    input: { evidenceId: E.a },
    landed: [E.t1],
  }),
];

export const COLLECT_FIXTURE_SOURCE: CollectSource = {
  evidence: COLLECT_FIXTURE_EVIDENCE,
  jobs: COLLECT_FIXTURE_JOBS,
  runs: COLLECT_FIXTURE_RUNS,
};
