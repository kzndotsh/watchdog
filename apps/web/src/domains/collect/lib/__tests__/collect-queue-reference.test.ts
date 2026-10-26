import { describe, expect, it } from "vitest";

import { buildCollectIndex } from "@/domains/collect/lib/collect-index";
import { buildEvidenceRecord, buildJobListRecord } from "@/testing/records";
import type { JsonObject } from "@watchdog/schemas/shared";
import {
  COLLECT_FIXTURE_ROWS,
  COLLECT_FIXTURE_SOURCE,
  collectQueueReference,
  type CollectSource,
  type CollectSourceJob,
} from "@watchdog/schemas/testing";
import { fc } from "@watchdog/test-kit/fc";
import { testId } from "@watchdog/test-kit/fixtures";

/*
 * Collect's queue projection (#574) restates today's queue builder in SQL. The TypeScript
 * reference (`collectQueueReference`) is the bridge: the database tests hold the SQL to it, and
 * this test holds it to `buildCollectIndex` on the rules both share (which rows exist, their kind,
 * state and member Jobs). Order is not compared: the projection's sorts are new.
 */

function iso(micros: number | null): string | null {
  return micros === null ? null : new Date(micros / 1000).toISOString();
}

function isoOf(micros: number): string {
  return new Date(micros / 1000).toISOString();
}

type RowFacts = { kind: string; state: string; members: string[] };

function rowKind(row: {
  readonly evidence: unknown;
  readonly playbookRunId: string | null;
}): string {
  if (row.evidence !== null) return "evidence";
  return row.playbookRunId === null ? "job" : "run";
}

type InputForm = "none" | "valid" | "padded" | "upper" | "junk" | "source";

/** U+00A0, which JavaScript's `trim` removes. */
const NBSP = String.fromCodePoint(0xa0);

/** A Job input naming `ref` in one of the forms the builder parses (or fails to). */
const INPUT_FORMS: Record<InputForm, (ref: string) => JsonObject> = {
  none: () => ({ host: "host.example" }),
  valid: (ref) => ({ evidenceId: ref }),
  padded: (ref) => ({ evidenceId: `\t${ref}${NBSP}` }),
  upper: (ref) => ({ evidenceId: ref.toUpperCase() }),
  junk: (ref) => ({ evidenceId: `${ref}x` }),
  source: (ref) => ({ sourceEvidenceId: ref }),
};

/** What the builder shows: normal mode (visible Evidence and every Job), then hidden mode. */
function builderRows(source: CollectSource): Record<string, RowFacts> {
  const runs = new Map(source.runs.map((run) => [run.id, run]));
  const evidence = source.evidence.map((row) =>
    buildEvidenceRecord({
      id: row.id,
      label: row.label,
      notes: row.notes,
      sourceUrl: row.sourceUrl,
      entityId: row.entityId,
      capturedAt: isoOf(row.capturedAt),
      processedAt: iso(row.processedAt),
      deletedAt: iso(row.deletedAt),
    })
  );
  const jobs = source.jobs.map((job: CollectSourceJob) =>
    buildJobListRecord({
      id: job.id,
      capabilityId: job.capabilityId,
      status: job.status,
      input: job.input,
      playbookRunId: job.playbookRunId,
      playbookId:
        job.playbookRunId === null
          ? null
          : (runs.get(job.playbookRunId)?.playbookId ?? null),
      retryOfJobId: job.retryOfJobId,
      evidenceIds: [...job.evidenceIds],
      createdAt: isoOf(job.createdAt),
      updatedAt: isoOf(job.finishedAt ?? job.startedAt ?? job.createdAt),
      startedAt: iso(job.startedAt),
      finishedAt: iso(job.finishedAt),
    })
  );
  const normal = buildCollectIndex(
    evidence.filter((row) => row.deletedAt === null),
    jobs
  );
  const hidden = buildCollectIndex(
    evidence.filter((row) => row.deletedAt !== null),
    []
  );
  const out: Record<string, RowFacts> = {};
  for (const row of [...normal.rows, ...hidden.rows]) {
    out[row.id] = {
      kind: rowKind(row),
      state: row.state,
      members: row.runs.map((run) => run.job.id).sort(),
    };
  }
  return out;
}

function referenceRows(source: CollectSource): Record<string, RowFacts> {
  return Object.fromEntries(
    collectQueueReference(source).map((row) => [
      row.id,
      { kind: row.kind, state: row.state, members: [...row.members].sort() },
    ])
  );
}

const STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
const CAPS = [
  "network.dns.lookup",
  "evidence.harvest",
  "evidence.extract.ai",
  "network.url.enrich",
] as const;

/** A Case's graph: Evidence (some hidden), runs, and Jobs that land, link by input and retry. */
const sourceArb: fc.Arbitrary<CollectSource> = fc
  .record({
    evidence: fc.array(
      fc.record({
        hidden: fc.boolean(),
        processed: fc.boolean(),
        minute: fc.integer({ min: 0, max: 50 }),
      }),
      { minLength: 1, maxLength: 6 }
    ),
    runCount: fc.integer({ min: 0, max: 3 }),
    jobs: fc.array(
      fc.record({
        cap: fc.constantFrom(...CAPS),
        status: fc.constantFrom(...STATUSES),
        run: fc.integer({ min: -1, max: 2 }),
        landed: fc.array(fc.nat({ max: 5 }), { maxLength: 2 }),
        inputRef: fc.nat({ max: 5 }),
        inputForm: fc.constantFrom(
          "none",
          "valid",
          "padded",
          "upper",
          "junk",
          "source"
        ),
        retryOf: fc.option(fc.nat({ max: 20 }), { nil: null }),
        minute: fc.integer({ min: 0, max: 50 }),
      }),
      { maxLength: 12 }
    ),
  })
  .map(({ evidence, runCount, jobs }) => {
    const evidenceIds = evidence.map((_, i) => testId(0xe_00 + i));
    const runIds = Array.from({ length: runCount }, (_, i) =>
      testId(0xc_00 + i)
    );
    const at = (minute: number) =>
      (Date.UTC(2026, 0, 1) + minute * 60_000) * 1000;
    const pick = (n: number) => evidenceIds[n % evidenceIds.length] ?? "";
    const built: CollectSourceJob[] = [];
    for (const [i, spec] of jobs.entries()) {
      const ref = pick(spec.inputRef);
      const input = INPUT_FORMS[spec.inputForm](ref);
      const playbookRunId =
        spec.run >= 0 && spec.run < runIds.length
          ? (runIds[spec.run] ?? null)
          : null;
      // A retry repeats an earlier Job of the same run (or of no run), as the app makes one.
      const earlier = built.filter(
        (job) => job.playbookRunId === playbookRunId
      );
      const retryOfJobId =
        spec.retryOf === null || earlier.length === 0
          ? null
          : (earlier[spec.retryOf % earlier.length]?.id ?? null);
      built.push({
        id: testId(0xb_00 + i),
        capabilityId: spec.cap,
        status: spec.status,
        input,
        playbookRunId,
        retryOfJobId,
        evidenceIds: [...new Set(spec.landed.map(pick))],
        createdAt: at(spec.minute),
        startedAt: spec.status === "queued" ? null : at(spec.minute + 1),
        finishedAt:
          spec.status === "queued" || spec.status === "running"
            ? null
            : at(spec.minute + 2),
        resultSummary: null,
        error: null,
        interpretError: null,
      });
    }
    return {
      evidence: evidence.map((row, i) => ({
        id: evidenceIds[i] ?? "",
        capturedAt: at(row.minute),
        processedAt: row.processed ? at(row.minute) : null,
        deletedAt: row.hidden ? at(row.minute + 60) : null,
        entityId: null,
        label: `Evidence ${i}`,
        notes: null,
        sourceUrl: null,
      })),
      jobs: built,
      runs: runIds.map((id, i) => ({
        id,
        playbookId: `playbook-${i}`,
        createdAt: at(i),
      })),
    };
  });

describe("collectQueueReference against buildCollectIndex", () => {
  it("agrees on the 12-case fixture, and both match the hand-written rows", () => {
    const expected = Object.fromEntries(
      Object.entries(COLLECT_FIXTURE_ROWS).map(([id, row]) => [
        id,
        { kind: row.kind, state: row.state, members: [...row.members].sort() },
      ])
    );
    expect(referenceRows(COLLECT_FIXTURE_SOURCE)).toEqual(expected);
    expect(builderRows(COLLECT_FIXTURE_SOURCE)).toEqual(expected);
  });

  it("agrees on generated graphs", () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        expect(referenceRows(source)).toEqual(builderRows(source));
      }),
      { numRuns: 300 }
    );
  });
});
