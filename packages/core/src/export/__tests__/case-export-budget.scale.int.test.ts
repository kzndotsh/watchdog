import { randomBytes, randomUUID } from "node:crypto";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@watchdog/db";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-db";

import { warmObjectStore } from "../../infra/__tests__/helpers/object-store-ready";
import { runDomain } from "../../infra/run-domain";
import {
  measureCaseExportEffect,
  writeCaseExportZipEffect,
} from "../case-export";
import type { ZipSink } from "../zip-writer";
import { MIB, SETTINGS, upload } from "./helpers/case-export-fixtures";

/** A sink that keeps nothing: it counts, so the test measures the export and not its output. */
function countingSink(): ZipSink & { bytes: () => number } {
  let written = 0;
  return {
    write: (chunk) => {
      written += chunk.byteLength;
      return Promise.resolve();
    },
    end: () => Promise.resolve(),
    bytes: () => written,
  };
}

// A forced collection before each sample, so the budget measures what the export still holds,
// not garbage V8 has yet to collect (that depends on GC timing and differs between machines).
setFlagsFromString("--expose-gc");
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `gc` is a function once exposed
const collect = runInNewContext("gc") as () => void;

/** Live memory: JS heap, plus the Buffers and ArrayBuffers outside it (`external` already counts them). */
function heldBytes(): number {
  collect();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.external;
}

/** Peak of `heldBytes()` while `work` runs, sampled every 50 ms. */
async function peakWhile(work: () => Promise<void>): Promise<number> {
  let peak = heldBytes();
  const timer = setInterval(() => {
    peak = Math.max(peak, heldBytes());
  }, 50);
  try {
    await work();
  } finally {
    clearInterval(timer);
  }
  return Math.max(peak, heldBytes());
}

warmObjectStore();

describe("Case export memory budget (scale)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  it("exports a large generated Case within a memory budget that is far below its size", async () => {
    const cased = await seedCase(db, { name: "Large" });
    // 1 object of 16 MiB, referenced by 48 Evidence rows: the Case holds 768 MiB of Evidence.
    const fileBytes = 16 * MIB;
    const fileCount = 48;
    // A 4 KiB random block repeated: deflate finds the repeats, so the archive is cheap to build.
    const block = randomBytes(4096);
    const body = Buffer.concat(
      Array.from({ length: fileBytes / block.byteLength }, () => block)
    );
    const stored = await upload(cased.id, body, "evidence.bin");
    for (let i = 0; i < fileCount; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- seeds are sequential
      await seedEvidence(db, cased.id, {
        kind: "file",
        label: `file-${i}.bin`,
        uri: stored.uri,
        sha256: stored.sha256,
        text: null,
      });
    }
    for (let i = 0; i < 150; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- seeds are sequential
      await seedEntity(db, cased.id, {
        id: randomUUID(),
        name: `Person ${i}`,
        slug: `person-${i}`,
      });
    }

    const totalEvidence = fileBytes * fileCount;
    const budget = 128 * MIB;
    // The budget is a sixth of the Case: an export that buffered it would fail by a wide margin.
    expect(totalEvidence).toBeGreaterThan(budget * 4);

    const sink = countingSink();
    const baseline = heldBytes();
    let stats: Awaited<ReturnType<typeof run>> | undefined;
    const run = () =>
      runDomain(writeCaseExportZipEffect(cased.id, sink, SETTINGS));
    const peak = await peakWhile(async () => {
      stats = await run();
    });

    expect(stats).toMatchObject({
      evidenceIncluded: fileCount,
      evidenceSkipped: 0,
      evidenceBytes: totalEvidence,
    });
    expect(sink.bytes()).toBeGreaterThan(0);
    expect(peak - baseline).toBeLessThan(budget);
  }, 180_000);

  it("keeps a text-heavy Case within a memory budget too: sizes in SQL, bodies a page at a time", async () => {
    const cased = await seedCase(db, { name: "Text heavy" });
    // 320 pasted texts and 80 attestations of 1 MiB each: 400 MiB that never fits in the budget.
    const body = "text of the evidence, repeated. ".repeat(MIB / 32);
    const textRows = 320;
    const attestationRows = 80;
    for (let i = 0; i < textRows + attestationRows; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- seeds are sequential
      await seedEvidence(db, cased.id, {
        kind: i < textRows ? "other" : "attestation",
        label: `text-${i}`,
        text: `${i}:${body}`,
      });
    }
    const totalText = (textRows + attestationRows) * MIB;
    const budget = 128 * MIB;
    expect(totalText).toBeGreaterThan(budget * 3);

    // Measuring reads sizes only: the limit is passed on the first query and no body is fetched.
    const measureBaseline = heldBytes();
    let measured: Awaited<ReturnType<typeof measure>> | undefined;
    const measure = () =>
      runDomain(
        measureCaseExportEffect(cased.id, cased.organizationId, SETTINGS)
      );
    const measurePeak = await peakWhile(async () => {
      measured = await measure();
    });
    expect(measured).toMatchObject({ kind: "ok", overLimit: true });
    expect(measured?.kind === "ok" && measured.evidenceBytes).toBeGreaterThan(
      totalText
    );
    expect(measurePeak - measureBaseline).toBeLessThan(32 * MIB);

    const sink = countingSink();
    const baseline = heldBytes();
    let stats: Awaited<ReturnType<typeof run>> | undefined;
    const run = () =>
      runDomain(writeCaseExportZipEffect(cased.id, sink, SETTINGS));
    const peak = await peakWhile(async () => {
      stats = await run();
    });

    expect(stats).toMatchObject({
      evidenceIncluded: textRows,
      evidenceSkipped: 0,
      markdownFiles: 2,
    });
    expect(sink.bytes()).toBeGreaterThan(0);
    expect(peak - baseline).toBeLessThan(budget);
  }, 300_000);
});
