import { randomBytes, randomUUID } from "node:crypto";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { Effect } from "effect";
import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-db";

import { blobStoreLayer, uploadArtifactEffect } from "../../infra/blob";
import { runDomain } from "../../infra/run-domain";
import {
  measureCaseExportEffect,
  writeCaseExportZipEffect,
} from "../case-export";
import type { CaseExportSettings } from "../settings";
import type { ZipSink } from "../zip-writer";

const MIB = 1024 * 1024;

const SETTINGS: CaseExportSettings = {
  inlineMaxBytes: 100 * MIB,
  linkTtlMs: 60_000,
  concurrency: 4,
};

function upload(caseId: CaseId, bytes: Uint8Array, name: string) {
  return Effect.runPromise(
    uploadArtifactEffect({
      caseId,
      bytes,
      mime: "application/octet-stream",
      name,
    }).pipe(Effect.provide(blobStoreLayer))
  );
}

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

/** A sink that keeps everything, for tests that open the archive. */
function collectingSink(): ZipSink & { archive: () => Uint8Array } {
  const chunks: Uint8Array[] = [];
  return {
    write: (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    },
    end: () => Promise.resolve(),
    archive: () => Buffer.concat(chunks),
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

describe("Case export (streaming)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("writes the archive of a Case: notes, Evidence files and text, and counts what it left out", async () => {
    const cased = await seedCase(db, { name: "Streamed" });
    const entity = await seedEntity(db, cased.id, {
      id: randomUUID(),
      name: "Alice Example",
    });
    const payload = randomBytes(300_000);
    const stored = await upload(cased.id, payload, "scan.bin");
    await seedEvidence(db, cased.id, {
      kind: "file",
      label: "scan.bin",
      mime: "application/octet-stream",
      uri: stored.uri,
      sha256: stored.sha256,
      text: null,
      entityId: entity.id,
    });
    await seedEvidence(db, cased.id, {
      kind: "file",
      label: "gone.bin",
      uri: `${cased.id}/missing/gone.bin`,
      sha256: "0".repeat(64),
      text: null,
    });
    await seedEvidence(db, cased.id, {
      kind: "other",
      label: "pasted",
      text: "pasted text body",
    });
    await seedEvidence(db, cased.id, {
      kind: "attestation",
      label: "statement",
      text: "I saw it",
    });

    const sink = collectingSink();
    const stats = await runDomain(
      writeCaseExportZipEffect(cased.id, sink, SETTINGS)
    );

    const files = unzipSync(sink.archive());
    const names = Object.keys(files);
    expect(names).toContain(`${cased.slug}/CASE.md`);
    expect(names).toContain(`${cased.slug}/${entity.kind}s/${entity.slug}.md`);
    expect(names).toContain(`${cased.slug}/evidence/attestations.md`);
    const scan = names.find((name) => name.includes("--scan"));
    expect(scan).toBeDefined();
    expect(Buffer.from(files[scan ?? ""] ?? []).equals(payload)).toBe(true);
    const pasted = names.find((name) => name.endsWith(".txt"));
    expect(new TextDecoder().decode(files[pasted ?? ""])).toBe(
      "pasted text body"
    );
    expect(stats).toMatchObject({
      evidenceIncluded: 2,
      evidenceSkipped: 1,
    });
    expect(stats.evidenceBytes).toBe(
      payload.byteLength + "pasted text body".length
    );
  });

  it("measures a Case without reading it, and stops counting once it is over the limit", async () => {
    const cased = await seedCase(db, { name: "Measured" });
    const stored = await upload(cased.id, randomBytes(2 * MIB), "big.bin");
    for (let i = 0; i < 6; i += 1) {
      // One object behind several rows: sizes are counted per row, as the export reads them.
      // oxlint-disable-next-line no-await-in-loop -- seeds are sequential
      await seedEvidence(db, cased.id, {
        kind: "file",
        label: `copy-${i}.bin`,
        uri: stored.uri,
        sha256: stored.sha256,
        text: null,
      });
    }
    const under = await runDomain(
      measureCaseExportEffect(cased.id, cased.organizationId, {
        ...SETTINGS,
        inlineMaxBytes: 100 * MIB,
      })
    );
    expect(under).toMatchObject({
      kind: "ok",
      evidenceBytes: 12 * MIB,
      overLimit: false,
    });
    const over = await runDomain(
      measureCaseExportEffect(cased.id, cased.organizationId, {
        ...SETTINGS,
        inlineMaxBytes: 5 * MIB,
        concurrency: 2,
      })
    );
    // Batches of two rows (4 MiB each): the third batch is never counted.
    expect(over).toMatchObject({ kind: "ok", overLimit: true });
    expect(over.kind === "ok" && over.evidenceBytes).toBe(8 * MIB);
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
